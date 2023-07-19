'use strict';



export function toggleMicOverlay(isMute, mainDiv) {
    var divList = mainDiv.getElementsByTagName("div")
    for (const element of divList) {
        if (element.id === "micDiv") {
            element.remove();
            break;
        }
    };
    var micDiv = document.createElement("div");
    micDiv.className = "overlay-mic";
    micDiv.id = "micDiv";
    var micImg = document.createElement("img");
    if (isMute) {
        micImg.src = "../assets/icons/mic-mute.svg";
        micImg.className = "mic-off-svg";
    } else {
        micImg.src = "../assets/icons/mic.svg";
        micImg.className = "mic-on-svg";
    }
    micImg.id = "micImg";
    micDiv.appendChild(micImg);
    mainDiv.appendChild(micDiv);
}

export function addUserOverlay(mainDiv, className, user) {
    var userDiv = document.createElement("div");
    userDiv.className = className;
    userDiv.id = "userDiv";
    userDiv.appendChild(document.createTextNode(user));
    mainDiv.appendChild(userDiv);
}


