const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const imdbApi = require('imdb-api');
const imagemin = require('imagemin');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const User = require('../models/User');
const { all } = require('./auth');

router.post('/update_user_data', checkToken, async (req, res) => {
    try {
        const email = req.decodedToken.email;
        const { propertiesToUpdate } = req.body;
        switch(Object.keys(propertiesToUpdate)[0]) {
            // Change avatar -> create buffer
            case "avatar":
            {
                const split = propertiesToUpdate.avatar.split(',');
                const base64string = split[1];
                const buffer = Buffer.from(base64string, 'base64');
                const minifiedBuffer = await imagemin.buffer(buffer, {
                    plugins: [
                        imageminMozjpeg({quality: 25}),
                        imageminPngquant({quality: [0.02, 0.04]})
                    ]
                });
                propertiesToUpdate.avatar = minifiedBuffer;
                updateUser(email, propertiesToUpdate, undefined, res);
            }
                break;
            // Change email -> only generate new token
            case "email":
            {
                const token = await generateToken({ email: propertiesToUpdate.email, password: req.decodedToken.password })
                updateUser(email, propertiesToUpdate, token, res);
            }
                break;
            // Change password -> create hashed password and generate new token
            case "password":
            {
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(propertiesToUpdate.password, salt);
                propertiesToUpdate.password = hash;
                const token = await generateToken({ email, hash })
                updateUser(email, propertiesToUpdate, token, res);
            }
                break;
            // Everything else -> simple update
            default:
            {
                updateUser(email, propertiesToUpdate, undefined, res);
            }
        }
    } catch(err) {
        handleError(err, res);
    }
})

async function updateUser(email, propertiesToUpdate, token, res) {
    const user = await User.findOneAndUpdate({ email }, { $set: propertiesToUpdate });
    if(token) {
        res.json({success: true, msg: "Successfully saved the data!", propertiesToUpdate, token})
    } else {
        res.json({success: true, msg: "Successfully saved the data!", propertiesToUpdate})
    }
}

// Copy from auth.js
async function generateToken(user) {
    const token = await jwt.sign({email: user.email, password: user.password}, require('../config/config').jwtKey);
    return token;
}

router.get('/home_page_data', checkToken, async (req, res) => {
    try {
        var currentlyWatching = {};
        var allTimePopular = {};
        var imdbIdsToBeCached = [];
        const user = await getUserData(req.decodedToken.email);
        const friends = await friendsIdsToFriendsData(user.friends);
        // Creating the objects and arrays needed for the homepage
        friends.forEach(friend => {
            // Loop through friends' every show
            currentlyWatchingFriend = [];
            friend.shows.forEach(show => {
                // Currently watching
                if(show.currentlyWatching) {
                    currentlyWatchingFriend.push(show);
                }
                // All time popular
                if(show.imdbId in allTimePopular) {
                    allTimePopular[show.imdbId].push({friendId: friend._id, currentlyWatching: show.currentlyWatching})
                } else {
                    allTimePopular[show.imdbId] = [{friendId: friend._id, currentlyWatching: show.currentlyWatching}]
                }
                // Cache show
                if(!imdbIdsToBeCached.includes(show.imdbId)) {
                    imdbIdsToBeCached.push(show.imdbId);
                }
            })
            if (currentlyWatchingFriend.length > 0) {
                currentlyWatching[friend._id] = currentlyWatchingFriend;
            }
        })
        const allTimePopularSorted = Object.fromEntries(
            Object.entries(allTimePopular).sort(([,a],[,b]) => b.length - a.length)
        );
        const cachedShows = await imdbIdsToShowsData(imdbIdsToBeCached);
        res.json({success: true, msg: "Succesfully created homepage data", user, currentlyWatching, allTimePopular: allTimePopularSorted, cachedShows, cachedFriends: friends});
    } catch(err) {
        handleError(err, res);
    }
})

router.get('/shows_page_data', checkToken, async (req, res) => {
    try {
        const user = await getUserData(req.decodedToken.email);
        var imdbIds = [];
        user.shows.forEach(element => {
            imdbIds.push(element.imdbId);
        });
        const shows = await imdbIdsToShowsData(imdbIds);
        // Add user specific data, like currentlyWatching
        shows.forEach(function(show, index, shows) {
            shows[index].currentlyWatching = user.shows[index].currentlyWatching;
        })
        res.json({success: true, msg: "Succesfully loaded shows data", user, shows});
    } catch (err) {
        handleError(err, res);
    }
})

async function imdbIdsToShowsData(imdbIds) {
    if(imdbIds.length == 0) {
        return [];
    }
    imdbPromises = [];
    imdbIds.forEach(imdbId => {
        const promise = imdbApi.get({id: imdbId}, {apiKey: require('../config/config').imdbApiKey});
        imdbPromises.push(promise);
    })
    const shows = await Promise.all(imdbPromises);
    return shows;
}

router.get('/search_shows', checkToken, async (req, res) => {
    try {
        const searchQuery = req.query.searchQuery;
        const imdbResponse = await imdbApi.search({name: searchQuery}, {apiKey: require('../config/config').imdbApiKey});
        var results = [];
        imdbResponse['results'].forEach(item => {
            if(item.type === 'series') {
                results.push(item);
            }
        })
        res.json({success: true, msg: "Succesfully retrieved restults for search query", results});
    } catch(err) {
        if(err.message.includes('Movie not found!')) {
            res.json({success: true, msg: "Succesfully retrieved restults for search query", results: []});
        } else {
            handleError(err);
        }
    }
})

router.get('/friends_page_data', checkToken, async (req, res) => {
    try {
        const user = await getUserData(req.decodedToken.email);
        const friendsPromise = friendsIdsToFriendsData(user.friends);
        const incomingPromise = friendsIdsToFriendsData(user.incomingFriendRequests);
        const outgoingPromise = friendsIdsToFriendsData(user.outgoingFriendRequests);
        const [friends, incoming, outgoing] = await Promise.all([friendsPromise, incomingPromise, outgoingPromise]);
        res.json({success: true, msg: "Succesfully loaded friends data", user, friends, incoming, outgoing});
    } catch(e) {
        handleError(err, res);
    }
})

async function friendsIdsToFriendsData(friendsIds) {
    if(friendsIds.length == 0) {
        return [];
    }
    friendsPromises = [];
    friendsIds.forEach(friendId => {
        const promise = User.findOne({_id: friendId});
        friendsPromises.push(promise);
    })
    const friends = await Promise.all(friendsPromises);
    return friends;
}

router.get('/search_users', checkToken, async (req, res) => {
    try {
        const loggedInUserEmail = req.decodedToken.email;
        const searchQuery = req.query.searchQuery;
        // Leave the currently logged in user out from the search results
        const results = await User.find({email: { $ne: loggedInUserEmail}, name: { $regex: new RegExp("^" + searchQuery.toLowerCase(), "i")}});
        res.json({success: true, msg: "Succesfully retrieved restults for search query", results});
    } catch(err) {
        handleError(err, res);
    }
})

router.post('/request_friend', checkToken, async (req, res) => {
    try {
        const { userId, friendId } = req.body;
        const user = await User.findOneAndUpdate({ _id: userId},{ $push: { outgoingFriendRequests: friendId }}, {new:true});        
        const friend = await User.findOneAndUpdate({ _id: friendId}, { $push: { incomingFriendRequests: userId }});
        const propertiesToUpdate = { outgoingFriendRequests: user.outgoingFriendRequests };
        res.json({success: true, msg: "Friend request succesfully processed", propertiesToUpdate});
    } catch(err) {
        handleError(err, res);
    }           
});

router.post('/accept_friend_request', checkToken, async (req, res) => {
    try {
        const { userId, friendId } = req.body;
        const user = await User.findOneAndUpdate({ _id: userId},{ $push: { friends: friendId }, $pullAll: { incomingFriendRequests: [friendId]}}, {new:true});
        const friend = await User.findOneAndUpdate({ _id: friendId},{ $push: { friends: userId }, $pullAll: { outgoingFriendRequests: [userId]}});
        const propertiesToUpdate = { friends: user.friends, incomingFriendRequests: user.incomingFriendRequests };
        res.json({success: true, msg: "Friend request succesfully accepted", propertiesToUpdate});
    } catch(err) {
        handleError(err, res);
    }                  
});

router.post('/reject_friend_request', checkToken, async (req, res) => {
    try {
        const { userId, friendId } = req.body;
        const user = await User.findOneAndUpdate({ _id: userId},{ $pullAll: { incomingFriendRequests: [friendId] }}, {new:true});
        const friend = await User.findOneAndUpdate({ _id: friendId},{ $pullAll: { outgoingFriendRequests: [userId]}});
        const propertiesToUpdate = { incomingFriendRequests: user.incomingFriendRequests };
        res.json({success: true, msg: "Friend request succesfully rejected", propertiesToUpdate});
    } catch(err) {
        handleError(err, res);
    }                  
});

router.get('/profile_page_data', checkToken, async (req, res) => {
    try {
        const user = await getUserData(req.decodedToken.email)
        res.json({success: true, msg: "Succesfully loaded profile data", user});
    } catch(err) {
        handleError(err, res);
    }
})

async function getUserData(email) {
    const user = await User.findOne({ email });
    return user;
}

function checkToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if(typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const bearerToken = bearer[1];
        jwt.verify(bearerToken, require('../config/config').jwtKey, (err, decoded) => {
            if(err) {
                console.log(err);
                res.status(403);
            }
            req.decodedToken = decoded;
        })
        next();
    } else {
        res.status(403);
    }
}

function handleError(err, res) {
    console.log(err);
    res.json({success: false, msg: "Something went wrong on the server while loading the data"});
}

module.exports = router;