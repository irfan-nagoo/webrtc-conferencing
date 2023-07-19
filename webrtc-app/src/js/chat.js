'use strict';

import { MAX_BUFFER_SIZE, MAX_DATA_CHUNK_SIZE } from "./constants";

var dataChunkQueue = [];
var dataChannelSend = document.getElementById("textInput");
var dataChannelReceive = document.getElementById("textChatDisplay");
var fileInputBtn = document.getElementById("fileInputBtn");

export async function sendData(sendDataChannel, local_user) {
    var data = {
        type: 'text',
        content: dataChannelSend.value,
        user: local_user
    };

    if (fileInputBtn.files.length === 0) {
        // text data
        if (!dataChannelSend.value) {
            return;
        }
        for (let socket_id in sendDataChannel) {
            var channel = sendDataChannel[socket_id];
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(data))
            } else {
                console.log("Data channel state[" + channel.readyState + "] not open");
            }
        }
    } else {
        // file transfer
        transferFiles(fileInputBtn.files, sendDataChannel, local_user);
        fileInputBtn.value = "";
    }
    addChatLine(data, 'send');
    dataChannelSend.value = '';
    console.log("Data Sent", data.content);
}

async function transferFiles(files, sendDataChannel, local_user) {
    for (const file of files) {
        var arrayBuffer = await file.arrayBuffer();
        var numberOfChunks = arrayBuffer.byteLength / MAX_DATA_CHUNK_SIZE | 0;
        var data = {
            type: 'file',
            name: file.name,
            content: arrayBuffer.byteLength,
            user: local_user
        };

        for (let socket_id in sendDataChannel) {
            var channel = sendDataChannel[socket_id];
            dataChunkQueue[socket_id] = [];
            var isPaused = false;
            if (channel.readyState === 'open') {
                // send size and user
                channel.send(JSON.stringify(data))

                // send actual chunk
                for (var i = 0; i < numberOfChunks; i++) {
                    var begin = i * MAX_DATA_CHUNK_SIZE;
                    var end = (i + 1) * MAX_DATA_CHUNK_SIZE;
                    isPaused = sendDataChunk(channel, arrayBuffer.slice(begin, end), socket_id, isPaused);
                }

                // send remaining chunk (if any)
                if (arrayBuffer.byteLength % MAX_DATA_CHUNK_SIZE) {
                    isPaused = sendDataChunk(channel, arrayBuffer.slice(numberOfChunks * MAX_DATA_CHUNK_SIZE)
                        , socket_id, isPaused);
                }
                console.log("File Sending in Progress!");
            } else {
                console.log("Data channel state[" + channel.readyState + "] not open");
            }
        }
    }
}

function sendDataChunk(channel, data, socket_id, isPaused) {
    dataChunkQueue[socket_id].push(data);
    if (isPaused) {
        return isPaused;
    }

    return bufferOrSend(channel, socket_id);
}

export function bufferOrSend(channel, socket_id) {
    let message = dataChunkQueue[socket_id].shift();

    while (message) {
        if (channel.bufferedAmount && channel.bufferedAmount > MAX_BUFFER_SIZE) {
            // buffer ammount reached, push back the message to the top of the
            // queue again
            dataChunkQueue[socket_id].unshift(message);
            return true;
        }

        channel.send(message);
        message = dataChunkQueue[socket_id].shift(message);
    }
    return false;
}


export function handelOnMessage() {
    var fileBuffer, currSize, fileName, userName;
    return function onMessage(event) {
        if (typeof event.data === "string") {
            var data = JSON.parse(event.data);
            if (data.type === "text") {
                console.log('Received Message', event);
                addChatLine(data, 'receive');
            } else {
                fileBuffer = new Uint8ClampedArray(parseInt(data.content));
                fileName = data.name;
                userName = data.user;
                currSize = 0;
            }
            return;
        }

        // add chunk
        var dataChunk = new Uint8ClampedArray(event.data);
        fileBuffer.set(dataChunk, currSize);
        currSize += dataChunk.byteLength;
        if (currSize === fileBuffer.byteLength) {
            // transfer complete
            console.log("File Receiving Complete!");
            var file = new Blob([fileBuffer])
            var aTag = document.createElement("a");
            var content = document.createTextNode(fileName);
            aTag.href = window.URL.createObjectURL(file);
            aTag.download = fileName;
            aTag.appendChild(content);
            addChatLine({
                type: 'file',
                content: aTag,
                user: userName
            }, "receive");

        }
    }
}

export function filesSelected(event) {
    var files;
    for (const file of event.srcElement.files) {
        files = files ? files + ', ' + file.name : file.name;
    }
    dataChannelSend.value = files;
}

function addChatLine(data, sendRecieve) {
    const mainDiv = document.createElement("div");
    const childDiv = document.createElement("div");
    const contentDiv = document.createElement("div");
    const userDiv = document.createElement("div");
    const pTime = document.createElement("p");
    const img = document.createElement("img");
    var content;
    if (data.type === "file") {
        content = data.content;
    } else {
        content = document.createTextNode(data.content);
    }
    const userContent = document.createTextNode("~" + data.user);
    const currentDate = new Date();
    const time = document.createTextNode(`${currentDate.getHours()}
                                      :${currentDate.getMinutes()}`);

    if (sendRecieve === 'send') {
        mainDiv.className = "d-flex flex-row justify-content-end mb-4 pt-1";
        contentDiv.className = "small p-2 me-3 mb-1 text-white rounded-3";
        contentDiv.id = "sendChatText"
        pTime.className = "small ms-3 mb-3 rounded-3 text-muted d-flex justify-content-end";
        pTime.id = "sendChatTime";
        img.src = "../assets/images/avatar.jpg";
        img.alt = data.user;
        img.id = "chatImage";
        userDiv.className = "d-flex flex-row justify-content-end";
        userDiv.id = "sendChatUser";
        mainDiv.appendChild(childDiv);
        mainDiv.appendChild(img);
    } else {
        mainDiv.className = "d-flex flex-row justify-content-start";
        contentDiv.className = "small p-2 ms-3 mb-1 text-white rounded-3 bg-secondary";
        contentDiv.id = "recieveChatText";
        pTime.className = "small me-3 mb-3 rounded-3 text-muted";
        pTime.id = "recieveChatTime";
        img.src = "../assets/images/avatar.jpg";
        img.alt = data.user;
        img.id = "chatImage";
        userDiv.className = "d-flex flex-row justify-content-start";
        userDiv.id = "recieveChatUser";
        mainDiv.appendChild(img);
        mainDiv.appendChild(childDiv);
    }
    userDiv.appendChild(userContent);
    contentDiv.appendChild(content);
    contentDiv.appendChild(userDiv);
    pTime.appendChild(time);
    childDiv.appendChild(contentDiv);
    childDiv.appendChild(pTime);
    dataChannelReceive.appendChild(mainDiv);
    dataChannelReceive.scrollTop = dataChannelReceive.scrollHeight;
}