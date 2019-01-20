const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const shortId = require('shortid')

const cors = require('cors')

const assert = require('assert')

const mongoose = require('mongoose')
const mongodb = require('mongodb')

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.use((req, res, next) => {
  console.log(req.method + " " + req.path + " - " + req.ip);
  next();
});


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});



// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const profileSchema = mongoose.Schema({
  username: String,
  _id: {
    type: String,
    default: shortId.generate
  },
  log: [
    {
      discription: String,
      duration: Number,
      date: Date
    }
  ]
})

const Profile = mongoose.model('Profile', profileSchema)

app.post('/api/exercise/new-user', (req, res) => {
  mongodb.MongoClient.connect(process.env.MONGO_URI, (err, db) => {
    var username = req.body.username;
    
    var users = db.collection('exercise_profiles')
    var abc = db.collection('url_collection')
    
    var query = (db, done) => {
      users.findOne({username: username}, (err, data) => {
        if (data == null) {
          var profile = new Profile({
            username: username,
          })
          users.insert(profile)
          done({username: profile.username, _id: profile._id})
        }
        else done("Username already exists")
      })
    }
    query(db, (data) => res.json(data))
  })
})

// log exercises to database
app.post('/api/exercise/add', (req, res) => {
  
  var _id = req.body.userId
  var log = {
    description: req.body.description,
    duration: req.body.duration,
    date: req.body.date == '' ? new Date() : new Date(req.body.date)
  }
  
  if (_id == '' || log.description == '' || log.duration == '') res.redirect('/')
  
  if (log.date == 'Invalid Date') res.json({error: "Invalid Date"})
  else {
    mongodb.MongoClient.connect(process.env.MONGO_URI, (err, db) => {
      assert.equal(err, null)

      var profiles = db.collection('exercise_profiles')

      profiles.findOne({_id: _id}, (err, profile) => {
        assert.equal(err, null)

        if (profile.length == 0) res.send("The user_id does not exist")
        else {
          profiles.update({_id: _id}, {$push: { log: log}}, {upsert: true})

          profile.log.push(log)

          res.json(profile)
        }
      })
    })
  }
})


// get a list of user logs
app.get('/api/exercise/log/:_id/:one?/:two?', (req, res) => {
  mongodb.MongoClient.connect(process.env.MONGO_URI, (err, db, callback) => {
    var profiles = db.collection('exercise_profiles')
    
    if (req.params.one) {
      if (req.params.two) { // get only the logs between the specified dates
        var from = new Date(req.params.one)
        var to = new Date(req.params.two)
        
        // if invalid date return invalid date
        if (from == 'Invalid Date') res.send(req.params.one + ": Invalid Date")
        else if (to == 'Invalid Date') res.send(req.params.two + ": Invalid Date")
        else {
          profiles.aggregate(
            [
              {
                $match:
                {
                  _id: req.params._id,
                  log:
                  {
                    $gte: new Date(from),
                    $lte: new Date(to)
                  }
                }
              },
              {
                $project:
                {
                  _id: 1,
                  username: 1,
                  log: 1,
                  count: {$size: '$log'}
                }
              }
            ]
          ).toArray((err, data) => {
            assert.equal(err, null)

            if (data.length == 0 ) res.json("No logs on those dates")
            else {
              var user = {}

              data.forEach(obj => user = obj)

              res.json(user)
            }
          })
        }
        
      } else { // get only the specified numbers of logs
        
        var limit = parseInt(req.params.one)
        
        if (limit.toString() == 'NaN')  res.send(req.params.one + " is not a number")
        else if (limit < 0) res.send("Limit must be a positive integer")
        else {
          profiles.aggregate([
            {
              $match:
              {
                _id: req.params._id
              }
            },
            {
              $project:
              {
                _id: 1,
                username: 1,
                log:
                {
                  $slice: ['$log', 0, limit]
                },
                count:
                {
                  $cond: 
                  {
                    if: {$isArray: limit}, then: '', else: limit
                  }
                }
              }
            }
          ]).toArray((err, data) => {
            assert.equal(err, null)
            assert.notEqual(data.length, 0)

            var user = {}

            data.forEach(obj => user = obj)

            res.json(user)
          })
        }
      }
    } else { // get all the user logs
      profiles.aggregate([
        {
          $match: 
          {
            _id: req.params._id
          }
        },
        {
          $project:
          {
            _id: 1,
            username: 1,
            log: 1,
            count: 
            {
              $size: "$log"
            }
          }
        }
      ]).toArray((err, data) => {
        assert.equal(err, null)
        assert.notEqual(data.length, 0)
        var user = {}
        
        data.forEach(obj => user = obj)
        
        res.json(user)
      })
    }
  })
})


// get a list of all the users
app.get('/api/exercise/users', (err, res) => {
  mongodb.MongoClient.connect(process.env.MONGO_URI, (err, db) => {
    if (err) res.send("We cannot complete the request right now. Please try again after afew minutes")
    else {
      var profiles = db.collection('exercise_profiles')
      profiles.find({}, {log: false}).toArray((err, profiles) => {
        assert.equal(err, null)
        assert.notEqual(profiles.length, 0)
        
        var users = []
        
        profiles.forEach(user => users.push(user))
        
        res.json(users)
      })
    }
  })
})


// Not found middleware
app.use((req, res, next) => {
  return next(res.json({status: 404, message: 'not found'}))
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})