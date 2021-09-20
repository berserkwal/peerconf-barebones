import './style.css';
import firebase from 'firebase/app';
import 'firebase/firestore';

// Firebase credentials
const firebaseConfig = {
  apiKey: 'AIzaSyAR9ou93PMDMchFHBz1oHuWRvPb5ncHgC4',
  authDomain: 'peerconf.firebaseapp.com',
  projectId: 'peerconf',
  storageBucket: 'peerconf.appspot.com',
  messagingSenderId: '521063782113',
  appId: '1:521063782113:web:3e2a27b9ee721db6db49a0',
};

// Firebase app initialization
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

// ICE servers
// const servers = {
//   iceServers: [
//     {
//       urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
//     },
//   ],
//   iceCandidatePoolSize: 10,
// };
const servers = {
  iceServers: [
    {
      username: '0xvNBi-qJP8pWUVDq9WoCRfi32LkosPxWRTf3QqT_b7TGTUNL6T3oGBTMDsHK8UeAAAAAGFIj05iZXJzZXJrd2Fs',
      urls: [
        'stun:bn-turn1.xirsys.com',
        'turn:bn-turn1.xirsys.com:80?transport=udp',
        'turn:bn-turn1.xirsys.com:3478?transport=udp',
        'turn:bn-turn1.xirsys.com:80?transport=tcp',
        'turn:bn-turn1.xirsys.com:3478?transport=tcp',
        'turns:bn-turn1.xirsys.com:443?transport=tcp',
        'turns:bn-turn1.xirsys.com:5349?transport=tcp',
      ],
      credentials: '526bb800-1a18-11ec-8f39-0242ac140004',
    },
  ],
};

// Global State
const peerConnection = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  peerConnection.onicecandidate = event => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot(snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      peerConnection.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value,
    callDoc = firestore.collection('calls').doc(callId),
    answerCandidates = callDoc.collection('answerCandidates'),
    offerCandidates = callDoc.collection('offerCandidates');

  peerConnection.onicecandidate = event => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
