// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDu8wQNkLXO35cdGrFPJlMMgbc1K2op7Us",
  authDomain: "meetnmart.firebaseapp.com",
  projectId: "meetnmart",
  storageBucket: "meetnmart.firebasestorage.app",
  messagingSenderId: "82487166386",
  appId: "1:82487166386:web:78f5db4c34a1774943d0ab",
  measurementId: "G-S49WCFPB80"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export {firebaseConfig};
// const analytics = getAnalytics(app);