require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');
const {google} = require('googleapis');
// setting up google apis
// https://medium.com/@shkim04/beginner-guide-on-google-sheet-api-for-node-js-4c0b533b071a
// https://github.com/googleworkspace/browser-samples/tree/main/sheets/snippets
const app = express();
const httpServer = createServer(app);
app.use(express.urlencoded({ extended: true }));

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});
let isLoggedIn = false, loggedInRow = -1, userRow = {};
// sheets-api-nodejs helped with the connection
const auth = new google.auth.GoogleAuth({
    keyFile: "keys.json", //the key file
    //url to spreadsheets API
    scopes: "https://www.googleapis.com/auth/spreadsheets",
});

io.on('connection', (socket) => {
    let tiktokConnectionWrapper;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);

    socket.on('setUniqueId', (uniqueId, options) => {

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object' && options) {
            delete options.requestOptions;
            delete options.websocketOptions;
        } else {
            options = {};
        }

        // Session ID in .env file is optional
        if (process.env.SESSIONID) {
            options.sessionId = process.env.SESSIONID;
            console.info('Using SessionId');
        }

        // Check if rate limit exceeded
        if (process.env.ENABLE_RATE_LIMIT && clientBlocked(io, socket)) {
            socket.emit('tiktokDisconnected', 'You have opened too many connections or made too many connection requests. Please reduce the number of connections/requests or host your own server instance. The connections are limited to avoid that the server IP gets blocked by TokTok.');
            return;
        }

        // Connect to the given username (uniqueId)
        try {
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            socket.emit('tiktokDisconnected', err.toString());
            return;
        }

        // Redirect wrapper control events once
        tiktokConnectionWrapper.once('connected', state => socket.emit('tiktokConnected', state));
        tiktokConnectionWrapper.once('disconnected', reason => socket.emit('tiktokDisconnected', reason));

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));

        // Redirect message events
        tiktokConnectionWrapper.connection.on('roomUser', msg => socket.emit('roomUser', msg));
        tiktokConnectionWrapper.connection.on('member', msg => socket.emit('member', msg));
        tiktokConnectionWrapper.connection.on('chat', msg => socket.emit('chat', msg));
        tiktokConnectionWrapper.connection.on('gift', msg => socket.emit('gift', msg));
        tiktokConnectionWrapper.connection.on('social', msg => socket.emit('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => socket.emit('like', msg));
        tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
        tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
        //tiktokConnectionWrapper.connection.on('emote', msg => socket.emit('emote', msg));
        tiktokConnectionWrapper.connection.on('envelope', msg => socket.emit('envelope', msg));
        tiktokConnectionWrapper.connection.on('subscribe', msg => socket.emit('subscribe', msg));
        tiktokConnectionWrapper.connection.on('rawData',  (messageTypeName, binary) => socket.emit('rawData', messageTypeName));
       //console.log(messageTypeName, binary);
    });

    socket.on('disconnect', () => {
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });

    socket.on('userUpdateSavedHosts', async (data) => {
        if(typeof loggedInRow !== undefined){
            console.log('based on when we logged in')
            console.log('user row = '+loggedInRow)
            console.log(data)
            console.log('/ userUpdateSavedHosts')
        }
        /*
            @ from async above
                ^ data.body = {
                #?   "mimeType": "application/json",
                ^    "text": "{\n\t\"values\": [\n\t\t[\"patchapi\"]\n\t]\n}"
                ^ }

            $ id = data.rowId
            $ values = data.body
            !googleSheets.spreadsheets.values.update({
            !    auth,
            !    spreadsheetId,
            !    range: `Sheet1!A${id}`, // {id} = the row # i believe?
            !    valueInputOption: "RAW",
            !    resource: {
            !        values: values
            !    }
            !})
        */
    })

    // data.place, data.vals
    socket.on('userSaveNote', async (dat)=>{
        //Auth client Object
        const authClientObject = await auth.getClient();
        //Google sheets instance
        const googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });

        const spreadsheetId = process.env.GOOGLE_USER_SHEET_ID //process.env.GOOGLE_SHEET_ID;
        const userNotes = await googleSheetsInstance.spreadsheets.values.get({
            auth, //auth object
            spreadsheetId, //spreadsheet id
            range: "Notes" //!A1:B1:C1:D1:E1:F1:G1:H1:I1:J1:K1:L1", //sheet name and range of cells
        });
        let noteCount = userNotes.data.values.length, n, userNotesRow = {};
        for(n=0;n<noteCount;n++){
            if(userNotes.data.values[n][0] == userRow.email){
                userNotesRow = {
                    i : n,
                    e : userRow.email,
                    rec : JSON.parse(userNotes.data.values[n][2])
                }
                break;
            }
        }

        if(userNotesRow.length == 0){
            // add it
        } else {
            // update it
            let totalNotes = userNotesRow.rec.length, r
            for(r=0;r<totalNotes;r++){
                if(userNotesRow.rec[r].qId == dat.qId){

                }
            }

            googleSheetsInstance.spreadsheets.values.update({
                auth,
                spreadsheetId,
                range: `Notes!A${userNotesRow.i}`, // {id} = the row # i believe?
                valueInputOption: "RAW",
                resource: {
                    values: [[
                        userNotesRow.row[0],
                        Intl.DateTimeFormat(this.locale, {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                            hour: "numeric",
                            minute: "numeric"
                        }).format(data.timestamp),
                        updatedNotes
                    ]]
                }
            })
        }
    })

    socket.on('userLogin', async (data) => {
        //Auth client Object
        const authClientObject = await auth.getClient();
        //Google sheets instance
        const googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });

        const spreadsheetId = process.env.GOOGLE_USER_SHEET_ID //process.env.GOOGLE_SHEET_ID;
        const userList = await googleSheetsInstance.spreadsheets.values.get({
            auth, //auth object
            spreadsheetId, //spreadsheet id
            range: "Sheet1" //!A1:B1:C1:D1:E1:F1:G1:H1:I1:J1:K1:L1", //sheet name and range of cells
        });
        let allUsers = userList.data.values.length, b
            , found = false
            , userRowData = {}, newSettingsMenu = `
            <li><h6 class="dropdown-header">User Settings</h6></li>
            <li><a class="dropdown-item" href="#">Saved Hosts</a></li>
            <li><a class="dropdown-item" href="#"></a></li>
            `

        for(b=1;b<allUsers;b++){
            if(userList.data.values[b][0] == data.email){
                found = true
                if(userList.data.values[b][2] == data.pass){
                    isLoggedIn = true
                    userRow = userList.data.values[b]
                    loggedInRow = b
                    userRowData = {
                        email: userRow[0],
                        name: userRow[1],
                        //created: userRow[3],
                        //lastLogin: userRow[4],
                        sheetId: userRow[5],
                        pExpires: userRow[6],
                        userList : userRow[7],
                        sounds : userRow[8],
                        keyFile : userRow[9]
                    };
                }
                // check password
                break;
            }
        }
        let respond = found == true && isLoggedIn == true ? 'ok' : 'fail'
        socket.emit('loginTry', {
            r : respond,
            info : userRowData,
            replaceForm : newSettingsMenu
        });
    })

    socket.on('addGift', async (data) => {
        //console.log(data)
        //Auth client Object
        const authClientObject = await auth.getClient();
        //Google sheets instance
        const googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });

        // spreadsheet id
        const spreadsheetId = process.env.GOOGLE_SHEET_ID //process.env.GOOGLE_SHEET_ID;
        await googleSheetsInstance.spreadsheets.values.append({
            auth, //auth object
            spreadsheetId, //spreadsheet id
            range: "Sheet1", //!A1:B1:C1:D1:E1:F1:G1:H1:I1:J1:K1:L1", //sheet name and range of cells
            valueInputOption: "USER_ENTERED", // The information will be passed according to what the user passes in as date, number or text
            resource: {
                values: [[
                    //data.timestamp.toLocaleDateString("en-US"),
                    Intl.DateTimeFormat(this.locale, {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric"
                    }).format(data.timestamp),
                    data.userId,
                    data.uniqueId,
                    data.nickname,
                    '=IMAGE("'+data.profilePictureUrl+'",2)',
                    data.giftId,
                    data.giftName,
                    '=IMAGE("'+data.giftPictureUrl+'",2)',
                    data.repeatCount,
                    data.diamondCount,
                    data.receiverUser,
                    data.receiverUserId
                ]] //[[dat, username, nickname, coinsSent, userId]]
            },
        });

        //response.send("Gift Saved!")
    })
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Serve frontend files
app.use(express.static('public'));

// Start http listener
const port = process.env.PORT || 8081;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);