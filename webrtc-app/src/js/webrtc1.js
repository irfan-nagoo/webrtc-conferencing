'use strict';

const mediaStreamConstraints = {
    video: {
        width: 200,
        height: 200,
        aspectRatio: 3/2 ,
    },
    audio: false
};


const localVideo = document.querySelector('video');

let localStream;

function gotLocalMediaStream(mediaStream){
    localStream = mediaStream;
    localVideo.srcObject = mediaStream;
}

function handleLocalMediaStream(error) {
    console.log('Error occurred: ', error);
}

navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    .then(gotLocalMediaStream).catch(handleLocalMediaStream);

