require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// MongoDB connection with retry logic
const connectWithRetry = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    console.log("Retrying connection in 5 seconds...");
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// Add request logging middleware at the top
app.use((req, res, next) => {
  console.log("=== Incoming Request ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", req.headers);
  console.log("======================");
  next();
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
  console.log("=== Authentication Check ===");
  console.log("Request URL:", req.url);
  console.log("Request headers:", req.headers);

  const authHeader = req.headers["authorization"];
  console.log("Auth header:", authHeader);

  if (!authHeader) {
    console.log("No authorization header found");
    return res.status(401).json({ error: "No authorization header" });
  }

  const token = authHeader.split(" ")[1];
  console.log("Token:", token ? "Present" : "Missing");

  if (!token) {
    console.log("No token found in authorization header");
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) {
      console.log("Token verification failed:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }
    console.log("Token verified successfully. User:", user);
    req.user = user;
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
    console.log("Fetching books with chat rooms...");
    const books = await Book.find()
      .populate("userId", "userId")
      .populate("likes", "userId")
      .populate({
        path: "chatRoomIds",
        populate: [
          {
            path: "participants",
            select: "userId",
          },
          {
            path: "messages",
            populate: {
              path: "senderId",
              select: "userId",
            },
          },
        ],
      });

    // Log the structure of the first book's chat rooms for debugging
    if (books.length > 0) {
      console.log(
        "Sample book chat rooms structure:",
        JSON.stringify(books[0].chatRoomIds, null, 2)
      );
    }

    res.json(books);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).json({ error: "Error fetching books: " + error.message });
  }
});

// Get books shared by the current user
app.get("/api/books/my-books", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching books for user:", req.user); // Debug log
    const books = await Book.find({ userId: req.user.id })
      .populate("userId", "userId")
      .populate("likes", "userId")
      .populate("chatRoomIds");

    console.log("Found books:", books); // Debug log
    res.json(books);
  } catch (error) {
    console.error("Error fetching user's books:", error);
    res
      .status(500)
      .json({ error: "Error fetching your books: " + error.message });
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
    const book = await Book.findById(bookId).populate("userId", "userId");
    if (!book) return res.status(404).send("Book not found");

    // Check if already liked
    if (book.likes.includes(req.user.id)) {
      return res.status(400).send("You have already liked this book");
    }

    // Add user to likes
    book.likes.push(req.user.id);
    await book.save();

    // Check if chat room already exists between these users
    let chatRoom = await ChatRoom.findOne({
      participants: { $all: [req.user.id, book.userId._id] },
    });

    // If no chat room exists, create a new one
    if (!chatRoom) {
      chatRoom = new ChatRoom({
        bookId,
        participants: [req.user.id, book.userId._id],
        messages: [
          {
            senderId: req.user.id,
            message: `${req.user.userId} liked your book "${book.title}"! Let's begin chat!`,
          },
        ],
      });
      await chatRoom.save();
    }

    // Update the book with the chat room ID
    book.chatRoomIds.push(chatRoom._id);
    await book.save();

    // Return the book data including userId and chat room IDs
    res.json({
      message: "Book liked successfully",
      userId: book.userId.userId,
      chatRoomIds: book.chatRoomIds,
      chatRoomId: chatRoom._id,
    });
  } catch (error) {
    console.error("Error liking book:", error);
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

// Get user's chat rooms
app.get("/api/chatrooms/user", authenticateToken, async (req, res) => {
  try {
    console.log("=== Fetching User's Chat Rooms ===");
    console.log("User ID:", req.user.id);

    const chatRooms = await ChatRoom.find({
      participants: req.user.id,
    })
      .populate("participants", "userId")
      .populate("bookId", "title")
      .populate({
        path: "messages",
        populate: {
          path: "senderId",
          select: "userId",
        },
      });

    console.log("Found chat rooms:", chatRooms.length);

    const formattedChatRooms = chatRooms.map((room) => ({
      id: room._id,
      bookTitle: room.bookId ? room.bookId.title : "Unknown Book",
      participants: room.participants.map((p) => ({
        id: p._id,
        userId: p.userId,
      })),
      messages: room.messages.map((m) => ({
        text: m.message,
        sender: m.senderId.userId,
        timestamp: m.createdAt,
      })),
    }));

    console.log("Formatted chat rooms:", formattedChatRooms);
    console.log("=== End Fetching User's Chat Rooms ===");

    res.json(formattedChatRooms);
  } catch (error) {
    console.error("Error fetching user's chat rooms:", error);
    res
      .status(500)
      .json({ error: "Error fetching chat rooms: " + error.message });
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
    if (!chatRoom)
      return res.status(404).json({ error: "Chat room not found" });
    res.json(chatRoom.messages);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error fetching messages: " + error.message });
  }
});

// Get specific chat room info
app.get("/api/chatrooms/:id", authenticateToken, async (req, res) => {
  const chatRoomId = req.params.id;

  try {
    console.log("Attempting to fetch chat room with ID:", chatRoomId);

    // Validate MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error(
        "MongoDB not connected. Current state:",
        mongoose.connection.readyState
      );
      return res.status(503).json({ error: "Database connection not ready" });
    }

    // Validate chat room ID format
    if (!mongoose.Types.ObjectId.isValid(chatRoomId)) {
      console.log("Invalid chat room ID format:", chatRoomId);
      return res.status(400).json({ error: "Invalid chat room ID format" });
    }

    const chatRoom = await ChatRoom.findById(chatRoomId)
      .populate({
        path: "participants",
        select: "userId",
      })
      .populate({
        path: "bookId",
        select: "title",
      });

    console.log("Found chat room:", chatRoom ? "Yes" : "No");

    if (!chatRoom) {
      console.log("Chat room not found with ID:", chatRoomId);
      return res.status(404).json({ error: "Chat room not found" });
    }

    // Check if user is a participant
    const userId = req.user.id;
    console.log("Checking authorization for user:", userId);
    console.log("Chat room participants:", chatRoom.participants);

    if (!chatRoom.participants.some((p) => p._id.toString() === userId)) {
      console.log("User not authorized to access chat room");
      return res
        .status(403)
        .json({ error: "Not authorized to access this chat room" });
    }

    // Get the book title
    const bookTitle = chatRoom.bookId ? chatRoom.bookId.title : "Unknown Book";

    // Format the response
    const response = {
      _id: chatRoom._id,
      bookTitle: bookTitle,
      participants: chatRoom.participants.map((p) => ({
        _id: p._id,
        userId: p.userId,
      })),
      messages: chatRoom.messages || [],
    };

    console.log("Sending chat room response:", response);
    return res.json(response);
  } catch (error) {
    console.error("Error fetching chat room:", error);
    return res.status(500).json({
      error: "Error fetching chat room",
      message: error.message,
    });
  }
});

// Send a message
app.post("/api/chatrooms/:id/messages", authenticateToken, async (req, res) => {
  const chatRoomId = req.params.id;
  const { message } = req.body;

  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom)
      return res.status(404).json({ error: "Chat room not found" });

    // Push the message with userId into the messages array
    chatRoom.messages.push({
      senderId: req.user.id,
      message,
    });

    await chatRoom.save();
    res.json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Error sending message: " + error.message });
  }
});

// Add a test route
app.get("/api/test", (req, res) => {
  console.log("Test route hit");
  res.json({ message: "Test route working" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("=== Global Error Handler ===");
  console.error("Error:", err);
  console.error("Request URL:", req.url);
  console.error("Request Method:", req.method);
  console.error("Request Headers:", req.headers);
  console.error("========================");

  res.status(500).json({
    error: "Internal server error",
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Add a catch-all route for undefined routes - MUST BE LAST
app.use((req, res) => {
  console.log("=== 404 - Route Not Found ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", req.headers);
  console.log("==========================");

  res.status(404).json({
    error: "Route not found",
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
