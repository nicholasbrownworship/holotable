// Replace this with the firebaseConfig object from your Firebase console
// (Project settings > General > Your apps > SDK setup and configuration)
const firebaseConfig = {
  apiKey: "AIzaSyBu0UOH1sNZoagxNnRAB4v3IGmiBShOhhU",
  authDomain: "holotable-c32dd.firebaseapp.com",
  projectId: "holotable-c32dd",
  storageBucket: "holotable-c32dd.firebasestorage.app",
  messagingSenderId: "332681664009",
  appId: "1:332681664009:web:836a9fbd96ce37210d4ad8"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
