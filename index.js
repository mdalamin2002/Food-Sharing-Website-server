const express = require("express");
const cors = require("cors");

const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  ChangeStream,
} = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

var admin = require("firebase-admin");

var serviceAccount = require("./Admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j98yejq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB Connection
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware/auth.js

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    req.firebaseUser = decodedToken; // You can access user info like uid, email, etc.
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid token from catch" });
  }
};

async function run() {
  try {
    await client.connect();
    const db = client.db("db_name");
    const foodsCollection = db.collection("foods");
    console.log("Connected to MongoDB");

    app.post("/add-food", async (req, res) => {
      const food = req.body;
      const result = await foodsCollection.insertOne(food);
      res.send(result);
    });

    app.put("/update-food/:id", async (req, res) => {
      const id = req.params.id;
      const updatedFood = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          foodName: updatedFood.foodName,
          quantity: updatedFood.quantity,
          pickupLocation: updatedFood.pickupLocation,
          expireDate: updatedFood.expireDate,
          notes: updatedFood.notes,
          image: updatedFood.image,
        },
      };

      const result = await foodsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/available-foods", async (req, res) => {
      const result = await foodsCollection
        .find({ status: "available" })
        .toArray();
      res.send(result);
    });
    app.get("/featured-foods", async (req, res) => {
      const result = await foodsCollection
        .find({ status: "available" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get("/details/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await foodsCollection.findOne(query);
      res.send(result);
    });

    app.get("/my-foods", verifyFirebaseToken, async (req, res) => {
      const result = await foodsCollection
        .find({ donorEmail: req.firebaseUser.email })
        .toArray();
      res.send(result);
    });

    app.delete("/delete-food/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await foodsCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

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
