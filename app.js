const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors')

app.use(cors())

const db = require('./config/config').DB;
mongoose
    .connect(db, {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false})
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.log(err));
app.use(express.json({limit: '50mb'}));

app.use('/auth', require('./routes/auth'));
app.use('/index', require('./routes/index'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started on port " + PORT));