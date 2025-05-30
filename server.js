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
  chatPartners: [
    {
      partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      chatRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" },
    },
  ],
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
    sharingOptions: {
      forSale: { type: Boolean, default: false },
      forExchange: { type: Boolean, default: false },
      forBorrow: { type: Boolean, default: false },
      forDiscussion: { type: Boolean, default: false },
    },
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
  console.log("\n=== Registration Request Start ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  const { userId, password, books } = req.body;

  try {
    // Create user
    console.log("\n1. Creating user...");
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ userId, password: hashedPassword });
    const savedUser = await newUser.save();
    console.log("User created with ID:", savedUser._id);

    // If books are provided, create them
    if (books && Array.isArray(books)) {
      console.log("\n2. Processing books...");
      console.log("Number of books to create:", books.length);
      console.log("Books data:", JSON.stringify(books, null, 2));

      // Create books one by one to ensure proper order and error handling
      for (let i = 0; i < books.length; i++) {
        const book = books[i];
        console.log(`\nCreating book ${i + 1}:`, book.title);

        const newBook = new Book({
          title: book.title,
          author: book.author,
          description: book.description,
          userId: savedUser._id,
          likes: [],
          sharingOptions: {
            forSale: book.sharingOptions?.forSale || false,
            forExchange: book.sharingOptions?.forExchange || false,
            forBorrow: book.sharingOptions?.forBorrow || false,
            forDiscussion: book.sharingOptions?.forDiscussion || false,
          },
        });

        console.log("Book object created:", newBook);
        const savedBook = await newBook.save();
        console.log("Book saved with ID:", savedBook._id);
      }
    } else {
      console.log("\nNo books provided in registration");
    }

    console.log("\n=== Registration Request Complete ===");
    res.status(201).send("User registered successfully with books");
  } catch (error) {
    console.error("\n=== Registration Error ===");
    console.error("Error details:", error);
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
      .populate({
        path: "likes",
        select: "_id userId",
      })
      .populate({
        path: "chatRoomId",
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

    // Log the structure of the first book for debugging
    if (books.length > 0) {
      console.log(
        "Sample book structure:",
        JSON.stringify(
          {
            title: books[0].title,
            sharingOptions: books[0].sharingOptions,
            likes: books[0].likes,
          },
          null,
          2
        )
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
      .populate("chatRoomId");

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
  try {
    const { title, author, description, sharingOptions } = req.body;
    const userId = req.user.userId;

    const book = new Book({
      title,
      author,
      description,
      userId,
      sharingOptions: {
        forSale: sharingOptions?.forSale || false,
        forExchange: sharingOptions?.forExchange || false,
        forBorrow: sharingOptions?.forBorrow || false,
        forDiscussion: sharingOptions?.forDiscussion || false,
      },
    });

    await book.save();
    res.status(201).json(book);
  } catch (error) {
    console.error("Error creating book:", error);
    res.status(500).json({ message: "Error creating book" });
  }
});

// Like a book
app.post("/api/books/:id/like", authenticateToken, async (req, res) => {
  const bookId = req.params.id;

  try {
    console.log("\n=== Like Book Request Start ===");
    console.log("Book ID:", bookId);
    console.log("User ID:", req.user.id);

    const book = await Book.findById(bookId).populate("userId", "userId");
    if (!book) {
      console.error("Book not found with ID:", bookId);
      return res.status(404).send("Book not found");
    }

    console.log("Found book:", {
      id: book._id,
      title: book.title,
      ownerId: book.userId._id,
    });

    // Check if already liked
    if (book.likes.includes(req.user.id)) {
      console.log("User has already liked this book");
      return res.status(400).send("You have already liked this book");
    }

    // Add user to likes
    book.likes.push(req.user.id);
    await book.save();
    console.log("Book likes updated");

    // Create notification message
    const notificationMessage = {
      senderId: req.user.id,
      message: `${req.user.userId} liked your book "${book.title}"! Let's chat!`,
      createdAt: new Date(),
    };
    console.log("Notification message created:", notificationMessage);

    // Find or create chat room based on user relationships
    let chatRoom;
    const currentUser = await User.findById(req.user.id);
    const bookOwner = await User.findById(book.userId._id);

    // Check if users already have a chat relationship
    const existingChatPartner = currentUser.chatPartners.find(
      (partner) => partner.partnerId.toString() === book.userId._id.toString()
    );

    if (existingChatPartner) {
      console.log("Found existing chat relationship");
      chatRoom = await ChatRoom.findById(existingChatPartner.chatRoomId);
    } else {
      console.log("Creating new chat relationship");
      // Create new chat room
      chatRoom = new ChatRoom({
        participants: [req.user.id, book.userId._id],
        messages: [notificationMessage],
      });
      await chatRoom.save();

      // Update both users' chatPartners
      currentUser.chatPartners.push({
        partnerId: book.userId._id,
        chatRoomId: chatRoom._id,
      });
      await currentUser.save();

      bookOwner.chatPartners.push({
        partnerId: req.user.id,
        chatRoomId: chatRoom._id,
      });
      await bookOwner.save();
    }

    // Add notification message to chat room
    chatRoom.messages.push(notificationMessage);
    await chatRoom.save();

    // Fetch the final state of the chat room
    const finalChatRoom = await ChatRoom.findById(chatRoom._id).populate(
      "messages.senderId",
      "userId"
    );

    if (!finalChatRoom) {
      console.error("Failed to fetch final chat room state");
      throw new Error("Could not fetch chat room state");
    }

    console.log("\nFinal chat room state:", {
      id: finalChatRoom._id,
      messageCount: finalChatRoom.messages.length,
      lastMessage: finalChatRoom.messages[finalChatRoom.messages.length - 1],
    });

    console.log("=== Like Book Request Complete ===\n");

    // Return the response
    const response = {
      message: "Book liked successfully",
      userId: book.userId.userId,
      chatRoomId: finalChatRoom._id.toString(),
      messages: finalChatRoom.messages.map((msg) => ({
        text: msg.message,
        senderId: msg.senderId,
        timestamp: msg.createdAt,
      })),
    };

    console.log("Sending response:", response);
    return res.json(response);
  } catch (error) {
    console.error("\n=== Like Book Error ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("=====================\n");
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
    const chatRoom = await ChatRoom.findById(chatRoomId).populate({
      path: "messages.senderId",
      select: "userId",
    });

    if (!chatRoom) {
      return res.status(404).json({ error: "Chat room not found" });
    }

    // Format messages to include all necessary fields
    const formattedMessages = chatRoom.messages.map((msg) => ({
      text: msg.message,
      senderId: msg.senderId,
      timestamp: msg.createdAt,
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
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
      })
      .populate({
        path: "messages.senderId",
        select: "userId",
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
      messages: chatRoom.messages.map((msg) => ({
        text: msg.message,
        senderId: msg.senderId,
        timestamp: msg.createdAt,
      })),
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
    if (!chatRoom) {
      return res.status(404).json({ error: "Chat room not found" });
    }

    // Create new message with timestamp
    const newMessage = {
      senderId: req.user.id,
      message: message,
      createdAt: new Date(),
    };

    // Push the message into the messages array
    chatRoom.messages.push(newMessage);
    await chatRoom.save();

    // Return the complete message object
    res.json({
      message: "Message sent successfully",
      newMessage: {
        text: newMessage.message,
        senderId: newMessage.senderId,
        timestamp: newMessage.createdAt,
      },
    });
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
