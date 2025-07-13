const express = require("express");
const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId, ChangeStream } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

var admin = require("firebase-admin");

var serviceAccount = require("./admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



// const serviceAccount = require("./admin-key.json");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


// middleware/auth.js


const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decodedToken; // You can access user info like uid, email, etc.
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token from catch' });
  }
};



async function run() {
  try {
    await client.connect();
    const db = client.db("db_name");
    const events = db.collection("collection");
  } finally {
  }
}

run().catch(console.dir);

// const m1 = (req, res, next) =>{
//   console.log("first")
//   console.log("name ", req.name);
//   req.name = "AR Arzu";

//   next();
// }

// const m2 = (req, res, next) =>{
//   console.log("name from m2 ", req.name);
//   console.log("m2")
// next();
// }

// Root route


app.get("/", verifyFirebaseToken, async (req, res) => {
console.log(req.firebaseUser);

  res.send("Server is running!");
});



app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});


/*
1. send token from client side
2. receive from server
3. decode the token from server
*/