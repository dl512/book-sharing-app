require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

console.log(`Node.js version: ${process.version}`);

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// User schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, minlength: 3 },
  password: { type: String, required: true, minlength: 6 },
});

const User = mongoose.model("User", userSchema);

// Book schema
const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    chatRoomIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" }], // Updated to hold multiple chat room IDs
  },
  { timestamps: true }
);

const Book = mongoose.model("Book", bookSchema);

// Chat room schema
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: { type: String, required: true, minlength: 1 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatRoomSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    messages: [messageSchema],
  },
  { timestamps: true }
);

const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);

// Middleware to authenticate tokens
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.sendStatus(401); // Unauthorized if no token

  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403); // Forbidden if token is invalid
    req.user = user; // Attach user info to request
    next();
  });
}

// Register user
app.post("/api/auth/register", async (req, res) => {
  const { userId, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ userId, password: hashedPassword });
    await newUser.save();
    res.status(201).send("User registered successfully");
  } catch (error) {
    res.status(400).send("Error registering user: " + error.message);
  }
});

// Login user
app.post("/api/auth/login", async (req, res) => {
  const { userId, password } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(401).send("Invalid credentials");

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).send("Invalid credentials");

    const token = jwt.sign(
      { id: user._id, userId: user.userId },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (error) {
    res.status(500).send("Error logging in: " + error.message);
  }
});

// Get list of books
app.get("/api/books", authenticateToken, async (req, res) => {
  try {
    const books = await Book.find()
      .populate("userId", "userId")
      .populate("likes", "userId")
      .populate("chatRoomIds"); // Populate chat room IDs
    res.json(books);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send("Error fetching books");
  }
});

// Share a book
app.post("/api/books", authenticateToken, async (req, res) => {
  const { title, author, description } = req.body;
  const newBook = new Book({
    title,
    author,
    description,
    userId: req.user.id,
  });

  try {
    await newBook.save();
    res.status(201).send("Book shared successfully");
  } catch (error) {
    res.status(400).send("Error sharing book: " + error.message);
  }
});

// Like a book
app.post("/api/books/:id/like", authenticateToken, async (req, res) => {
  const bookId = req.params.id;

  try {
    const book = await Book.findById(bookId).populate("userId", "userId"); // Populate userId
    if (!book) return res.status(404).send("Book not found");

    // Check if already liked
    if (book.likes.includes(req.user.id)) {
      return res.status(400).send("You have already liked this book");
    }

    // Add user to likes
    book.likes.push(req.user.id);
    await book.save();

    // Create a new chat room for this like
    const chatRoom = new ChatRoom({
      bookId,
      participants: [req.user.id, book.userId], // Include the book owner
    });
    await chatRoom.save();

    // Update the book with the new chat room ID
    book.chatRoomIds.push(chatRoom._id); // Add to chatRoomIds array
    await book.save();

    // Return the book data including userId and chat room IDs
    res.json({
      message: "Book liked successfully",
      userId: book.userId.userId, // Include the userId of the book owner
      chatRoomIds: book.chatRoomIds,
    });
  } catch (error) {
    res.status(500).send("Error liking book: " + error.message);
  }
});

// Create a chat room
app.post("/api/chatrooms", authenticateToken, async (req, res) => {
  const { bookId } = req.body;

  const chatRoom = new ChatRoom({
    bookId,
    participants: [req.user.id],
  });

  try {
    await chatRoom.save();
    res.status(201).json({ chatRoomId: chatRoom._id });
  } catch (error) {
    res.status(400).send("Error creating chat room: " + error.message);
  }
});

// Get chat room messages
app.get("/api/chatrooms/:id/messages", authenticateToken, async (req, res) => {
  const chatRoomId = req.params.id;

  try {
    const chatRoom = await ChatRoom.findById(chatRoomId).populate(
      "messages.senderId",
      "userId"
    );
    if (!chatRoom) return res.status(404).send("Chat room not found");
    res.json(chatRoom.messages);
  } catch (error) {
    res.status(500).send("Error fetching messages: " + error.message);
  }
});

// Send a message
app.post("/api/chatrooms/:id/messages", authenticateToken, async (req, res) => {
  const chatRoomId = req.params.id;
  const { message } = req.body;

  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) return res.status(404).send("Chat room not found");

    // Push the message with userId into the messages array
    chatRoom.messages.push({
      senderId: req.user.id, // Keep this if you want to reference the ObjectId
      userId: req.user.userId, // Store the userId as well
      message,
    });

    await chatRoom.save();
    res.send("Message sent successfully");
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).send("Error sending message: " + error.message);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
