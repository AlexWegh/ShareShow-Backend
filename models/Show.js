// Make imdbId imdbid

const mongoose = require('mongoose');

const ShowSchema = new mongoose.Schema({
    imdbId: {
        type: String
    },
    currentlyWatching: {
        type: Boolean
    }
})

const Show = mongoose.model('show', ShowSchema);

module.exports = Show;