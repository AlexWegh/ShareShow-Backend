const mongoose = require('mongoose');
const Show = require('./Show');

const UserSchema = mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    avatar: {
        type: Buffer
    },
    name: {
        type: String,
        required: true
    },
    shows: [ Show.schema ],
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    incomingFriendRequests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    outgoingFriendRequests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
})

const User = mongoose.model('User', UserSchema);

module.exports = User;