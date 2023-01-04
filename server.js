const http = require("http");
const app = require("express")();
const websocketServer = require("websocket").server

//Serve end points and return HTML files
app.get("/", (req,res)=> res.sendFile(__dirname + "/client.html"))
app.listen(9091, ()=>console.log("Serving on http port 9091"))

//Create http server and upgrade to websocket server
const httpServer = http.createServer();
httpServer.listen(9090, () => console.log("Listening.. on 9090"))
const wsServer = new websocketServer({
    "httpServer": httpServer
})

/* 
Client mappings, Games mappings
allClients final structure {clientId : {connection : , createdGames :}}
allGames final structure {guidKey : {"id" : , "balls" :, "clients" : [{"clientId":,"color":}], "state" :}}
*/
allClients = {};
allGames = {};

//Function to generate a GUID, taken from github
function S4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1); 
}
 
const guid = () => (S4() + S4() + "-" + S4() + "-4" + S4().substr(0,3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase();

/* 
Broadcast game state only to clients associated with the gameId of the player triggering the color change
This reduces the server load by avoiding the broadcasting of multiple games where players are decoupled
e.g Game 1 contains players 1,2,3
    Game 2 contains players 4,5,6
    Player 5 updates the color state, only Game 2 is broadcasted
    Game 1 should not broadcast the game state to players 1,2,3
    This design avoids the unneccesary server load

Avoid using a recursive function implementations since broadcasting is performed even when game state 
has not changed, recursion also uses stack and there may be risk of overflowing the stack, especially when
the recursive function has no stop/base condition
*/
function broadcastGameState(broadcastGameId){
    console.log("BroadCast called with gameId: " + broadcastGameId)
    const broadcastPayLoad = {
        "method": "broadcast",
        "game": allGames[broadcastGameId]
    }

    allGames[broadcastGameId].clients.forEach(clientOfGame => {
        allClients[clientOfGame.clientId].connection.send(JSON.stringify(broadcastPayLoad))
    })
}

//Websocket server accepts incoming client socket connection requests on port 9090
wsServer.on("request", socketRequest => {

    //Accept incoming client socket connection request and store client connection
    const clientConnection = socketRequest.accept(null, socketRequest.origin);
    console.log("Socket opened!");

    const clientId = guid();
    allClients[clientId] = {
        "connection":  clientConnection
    }

    const connectedPayLoad = {
        "method": "connected",
        "clientId": clientId
    }

    clientConnection.send(JSON.stringify(connectedPayLoad))

    //Listen for events on the established client socket connection
    clientConnection.on("open", () => console.log("Socket opened!"))

    /* 
    Implementation of this function can be removed if wished, however closing one or more client browsers will cease any further game
    play. Since the server maintains client and game state which is not purged upon browser refresh.
    The main problem occurs when the client closes the browser, no identification data is sent to the server and therefore associated
    games cannot be identified and updated. The server must be restarted.
    
    Alternative solution, may be to implement a game exit button on the DOM in order to remove the clients from the game from the server
    **Not implemented in this version
    */

    clientConnection.on("close", () => {
        
        restartPayload = {
            "method" : "restart",
        }

        console.log("Client closed the browser, game must be restarted ")
        Object.keys(allClients).forEach((clientId) => {
            allClients[clientId].connection.send(JSON.stringify(restartPayload));
        })

        allGames = {};
        allClients = {};

    })

    clientConnection.on("message", clientSocketMsg => 
    {

        const clientSocketMsgJSON = JSON.parse(clientSocketMsg.utf8Data);

        if (clientSocketMsgJSON.method === "create") 
        {
            const clientId = clientSocketMsgJSON.clientId;
            console.log("Create method server called by client :" + clientId);
            if(Object.keys(allGames).length == 0){
                gameId = guid();
                allGames[gameId] = {
                    "id": gameId,
                    "balls": 20,
                    "clients": [],
                    "state" : null
                }
            }

            //Client-side check implemented for multiple create game calls when pre-existing active game present
            const createdPayLoad = {
                "method": "created",
                "game" : allGames[gameId]
            }

            const requestClientConn = allClients[clientId].connection;
            requestClientConn.send(JSON.stringify(createdPayLoad)); 
        }

        if (clientSocketMsgJSON.method === "join") 
        {
            console.log("Join method server called!");
            const clientId = clientSocketMsgJSON.clientId;
            const gameId = clientSocketMsgJSON.gameId;
            const requestedGame = allGames[gameId];
            const playerColor =  {"0": "Red", "1": "Green", "2": "Blue"}[requestedGame.clients.length];

            if (requestedGame.clients.length >= 3) 
            {
                console.log("Max players reached!")
                return;
            }

            requestedGame.clients.push({
                "clientId": clientId,
                "color": playerColor
            })

            const joinedPayLoad = {
                "method": "joined",
                "game": requestedGame,
                "reqJoinClientId": clientId
            }

            //Update the all clients associated with the current joined game with the Game state
            requestedGame.clients.forEach(gameClient => {
                allClients[gameClient.clientId].connection.send(JSON.stringify(joinedPayLoad))
            })
        }

        if (clientSocketMsgJSON.method === "play") 
        {
            const gameId = clientSocketMsgJSON.gameId;
            const ballId = clientSocketMsgJSON.ballId;
            const color = clientSocketMsgJSON.color;

            //Checks for previous actions on a game requested for play
            let gameState = allGames[gameId].state; //either null or an object
            if (!gameState)
                gameState = {};
            
            //Add BallId key and color value to state object, assign the copy to the original state
            gameState[ballId] = color;
            allGames[gameId].state = gameState;

            console.log("Latest game state ");
            console.log(allGames[gameId].state);

            //Start broadcasting the game state to all clients assocaited with the game
            broadcastGameState(gameId);
            
        }

    })
})

