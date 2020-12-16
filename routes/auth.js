const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if(existingUser) {
            res.json({success: false, msg: "Email already exists"});
        } else {
            const hash = await bcrypt.hash(password, 10);
            const newUser = User({ email, password: hash, avatar: undefined, name, friends: [], incomingFriendRequests: [], outgoingFriendRequests: [] });
            newUser.save()
            .then(async user => {
                token = await generateToken(user);
                res.json({success: true, msg: "Succesfully created new user!", token, userData: newUser});
            })
            .catch(err => handleError(err, res));
        }
    } catch (err) {
        handleError(err, res);
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if(!user) {
            res.json({success: false, msg: "User not found"});
        } else {
            bcrypt.compare(password, user.password, async (err, isMatch) => {
                if(!isMatch) {
                    res.json({success: false, msg: "Password is incorrect"});
                } else {
                    token = await generateToken(user);
                    res.json({success: true, msg: "Succesfully logged in!", token, userData: user});
                }
                if(err) { 
                    console.log(err);
                }
            })
        }
    } catch(err) {
        handleError(err, res);
    }
})

async function generateToken(user) {
    const token = await jwt.sign({email: user.email, password: user.password}, require('../config/config').jwtKey);
    return token;
}

function handleError(err, res) {
    console.log(err);
    res.json({success: false, msg: "Something went wrong on the server while loading the data"});
}

module.exports = router;