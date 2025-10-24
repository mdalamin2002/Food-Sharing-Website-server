const express = require("express");
const cors = require("cors");

const {
  MongoClient,
  ServerApiVersion,
  ObjectId
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
console.log("Server starting on port:", PORT);

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j98yejq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log("MongoDB URI:", uri.replace(process.env.DB_PASS, '****').replace(process.env.DB_USER, '****'));

// Check if ObjectId is properly imported
console.log("ObjectId type:", typeof ObjectId);

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
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    console.log("MongoDB connected successfully");
    const db = client.db("food_sharing");
    console.log("Database selected:", db.databaseName);
    const foodsCollection = db.collection("foods");
    const profilesCollection = db.collection("profiles");
    const notificationsCollection = db.collection("notifications");
    console.log("Connected to MongoDB collections");

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

    app.patch("/request/:id", verifyFirebaseToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await foodsCollection.updateOne(query, {
        $set: {
          status: "requested",
          requestedBy: req.firebaseUser.email,
          requestDate: new Date(),
        },
      });
      res.send(result);
    });

    // Add rating and review to food
    app.post("/foods/:id/rating", verifyFirebaseToken, async (req, res) => {
      try {
        const foodId = req.params.id;
        const { rating, review, userName, userPhoto } = req.body;
        
        const newRating = {
          userId: req.firebaseUser.uid,
          userName: userName || "Anonymous",
          userPhoto: userPhoto || "",
          rating: parseFloat(rating),
          review,
          date: new Date()
        };
        
        const query = { _id: new ObjectId(foodId) };
        
        // Add the rating to the food item
        const result = await foodsCollection.updateOne(query, {
          $push: { ratings: newRating }
        });
        
        // Calculate new average rating
        const food = await foodsCollection.findOne(query);
        if (food.ratings && food.ratings.length > 0) {
          const totalRatings = food.ratings.reduce((sum, r) => sum + r.rating, 0);
          const averageRating = totalRatings / food.ratings.length;
          
          // Update the average rating
          await foodsCollection.updateOne(query, {
            $set: { averageRating: parseFloat(averageRating.toFixed(1)) }
          });
        }
        
        res.send({ success: true, result });
      } catch (error) {
        console.error("Error adding rating:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get("/requested-foods", async (req, res) => {
      const result = await foodsCollection
        .find({ status: "requested" })
        .toArray();
      res.send(result);
    });

    app.get("/my-foods", verifyFirebaseToken, async (req, res) => {
      const result = await foodsCollection
        .find({ donorEmail: req.firebaseUser.email })
        .toArray();
      res.send(result);
    });

    app.get("/my-requests", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const foods = await foodsCollection
        .find({ requestedBy: email })
        .toArray();
      res.send(foods);
    });

    // search available food

    app.get("/available-foods", async (req, res) => {
      const search = req.query.search || "";
      console.log(search);
      const query = search
      
        ? { foodName: { $regex: search, $options: "i" }, status: "available" } // case-insensitive
        : { status: "available" };

      const foods = await foodsCollection.find(query).toArray();
      res.send(foods);
    });

    //

    //delete request

    app.delete("/delete-request/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await foodsCollection.deleteOne(query);
      res.send(result);
    });

    app.delete("/delete-food/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await foodsCollection.deleteOne(query);
      res.send(result);
    });

    // Profile routes
    app.post("/profile", async (req, res) => {
      try {
        const profile = req.body;
        console.log("Saving profile:", profile);
        const query = { email: profile.email };
        const existingProfile = await profilesCollection.findOne(query);
        console.log("Existing profile:", existingProfile);

        let result;
        if (existingProfile) {
          // Update existing profile
          result = await profilesCollection.updateOne(query, {
            $set: profile,
          });
        } else {
          // Create new profile
          result = await profilesCollection.insertOne(profile);
        }
        console.log("Profile save result:", result);

        res.send({ success: true, result });
      } catch (error) {
        console.error("Error saving profile:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get("/profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        console.log("Fetching profile for email:", email);
        const query = { email: email };
        const profile = await profilesCollection.findOne(query);
        console.log("Profile found:", profile);
        
        // If profile doesn't exist, return a default profile structure
        if (!profile) {
          console.log("No profile found, returning default structure");
          res.send({
            name: "",
            email: email,
            phone: "",
            address: "",
            photoURL: ""
          });
        } else {
          res.send(profile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // Notification routes
    // Subscribe to notifications
    app.post("/notifications/subscribe", verifyFirebaseToken, async (req, res) => {
      try {
        const { foodPreferences, email } = req.body;
        
        const subscription = {
          email,
          foodPreferences, // array of food names/keywords
          subscribedAt: new Date()
        };
        
        // Check if already subscribed
        const existing = await notificationsCollection.findOne({ email });
        
        let result;
        if (existing) {
          // Update existing subscription
          result = await notificationsCollection.updateOne(
            { email },
            { $set: { foodPreferences, subscribedAt: new Date() } }
          );
        } else {
          // Create new subscription
          result = await notificationsCollection.insertOne(subscription);
        }
        
        res.send({ success: true, result });
      } catch (error) {
        console.error("Error subscribing to notifications:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Unsubscribe from notifications
    app.delete("/notifications/unsubscribe/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await notificationsCollection.deleteOne({ email });
        res.send({ success: true, result });
      } catch (error) {
        console.error("Error unsubscribing from notifications:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Get user's notification preferences
    app.get("/notifications/preferences/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const preferences = await notificationsCollection.findOne({ email });
        res.send(preferences || { foodPreferences: [] });
      } catch (error) {
        console.error("Error fetching notification preferences:", error);
        res.status(500).send({ success: false, error: error.message });
      }
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

// Function to check for new foods and send notifications
const checkAndSendNotifications = async () => {
  try {
    // Get all notifications subscriptions
    const subscriptions = await notificationsCollection.find({}).toArray();
        
    // Get recently added foods (last 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFoods = await foodsCollection.find({
      createdAt: { $gte: oneHourAgo },
      status: "available"
    }).toArray();
        
    if (recentFoods.length === 0 || subscriptions.length === 0) return;
        
    // For each subscription, check if any recent food matches preferences
    for (const subscription of subscriptions) {
      const matchingFoods = recentFoods.filter(food => 
        subscription.foodPreferences.some(pref => 
          food.foodName.toLowerCase().includes(pref.toLowerCase())
        )
      );
          
      if (matchingFoods.length > 0) {
        // In a real implementation, you would send an email or push notification here
        // For now, we'll just log it
        console.log(`Notification for ${subscription.email}: ${matchingFoods.length} new foods match your preferences`);
            
        // You could integrate with email services like Nodemailer or push notification services here
        // Example with Nodemailer:
        /*
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: subscription.email,
          subject: 'New Food Available!',
          text: `Hi! ${matchingFoods.length} new foods matching your preferences are now available.`
        };
            
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending email:', error);
          } else {
            console.log('Email sent:', info.response);
          }
        });
        */
      }
    }
  } catch (error) {
    console.error('Error checking notifications:', error);
  }
};
    
// Run notification check every 15 minutes
setInterval(checkAndSendNotifications, 15 * 60 * 1000);
    
try {
  app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });
} catch (error) {
  console.error("Error starting server:", error);
}
