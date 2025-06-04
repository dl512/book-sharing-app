require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS),
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);

// Configure CORS for the bucket
async function configureCORS() {
  try {
    await bucket.setCorsConfiguration(require("./cors.json"));
    console.log("CORS configuration updated successfully");
  } catch (error) {
    console.error("Error setting CORS configuration:", error);
  }
}

configureCORS();

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
  photoUrl: { type: String },
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
    photoUrl: { type: String },
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

// Check username availability
app.post("/api/auth/check-username", async (req, res) => {
  const { userId } = req.body;

  try {
    const existingUser = await User.findOne({ userId });
    if (existingUser) {
      return res.status(400).send("Username is already taken");
    }
    res.status(200).send("Username is available");
  } catch (error) {
    console.error("Error checking username:", error);
    res.status(500).send("Error checking username availability");
  }
});

// Register user
app.post("/api/auth/register", async (req, res) => {
  console.log("\n=== Registration Request Start ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  const { userId, password, books } = req.body;

  try {
    // Create user
    console.log("\n1. Creating user...");
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      userId,
      password: hashedPassword,
    });
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
        console.log("Book photo URL:", book.photoUrl);

        const newBook = new Book({
          title: book.title,
          author: book.author,
          description: book.description,
          photoUrl: book.photoUrl,
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
        console.log("Saved book photo URL:", savedBook.photoUrl);
      }
    } else {
      console.log("\nNo books provided in registration");
    }

    // Generate token for the new user
    const token = jwt.sign(
      { id: savedUser._id, userId: savedUser.userId },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    console.log("\n=== Registration Request Complete ===");
    res.status(201).json({
      message: "User registered successfully with books",
      token,
    });
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
    console.log("\n=== Fetching Books Request Start ===");
    console.log("User ID:", req.user.id);

    const books = await Book.find().populate("userId", "userId").populate({
      path: "likes",
      select: "_id userId",
    });

    console.log("Found books:", books.length);

    // Format the response to include necessary information
    const formattedBooks = books.map((book) => ({
      _id: book._id,
      title: book.title,
      author: book.author,
      description: book.description,
      photoUrl: book.photoUrl,
      userId: {
        _id: book.userId._id,
        userId: book.userId.userId,
      },
      likes: book.likes.map((like) => ({
        _id: like._id,
        userId: like.userId,
      })),
      sharingOptions: book.sharingOptions || {
        forSale: false,
        forExchange: false,
        forBorrow: false,
        forDiscussion: false,
      },
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    }));

    console.log("Sending formatted books response");
    console.log("=== Fetching Books Request Complete ===\n");

    res.json(formattedBooks);
  } catch (error) {
    console.error("\n=== Fetching Books Error ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("=====================\n");
    res.status(500).json({
      error: "Error fetching books",
      message: error.message,
    });
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
    console.log("\n=== Add Book Request Start ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("User object:", JSON.stringify(req.user, null, 2));

    const { title, author, description, sharingOptions, photoUrl } = req.body;

    // Validate user object
    if (!req.user || !req.user.id) {
      console.error("Invalid user object:", req.user);
      return res.status(401).json({
        error: "Authentication error",
        message: "Invalid user information",
      });
    }

    const userId = req.user.id;

    // Validate required fields
    if (!title || !author || !description) {
      console.log("Missing required fields:", { title, author, description });
      return res.status(400).json({
        error: "Missing required fields",
        message: "Title, author, and description are required",
      });
    }

    // Validate MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error(
        "MongoDB not connected. Current state:",
        mongoose.connection.readyState
      );
      return res.status(503).json({
        error: "Database error",
        message: "Database connection not ready",
      });
    }

    // Create book object
    const bookData = {
      title,
      author,
      description,
      photoUrl,
      userId,
      sharingOptions: sharingOptions
        ? {
            forSale: sharingOptions.forSale || false,
            forExchange: sharingOptions.forExchange || false,
            forBorrow: sharingOptions.forBorrow || false,
            forDiscussion: sharingOptions.forDiscussion || false,
          }
        : {
            forSale: false,
            forExchange: false,
            forBorrow: false,
            forDiscussion: false,
          },
    };

    console.log("Creating book with data:", JSON.stringify(bookData, null, 2));

    const book = new Book(bookData);
    console.log("Book object created:", book);

    // Validate book object before saving
    const validationError = book.validateSync();
    if (validationError) {
      console.error("Book validation error:", validationError);
      return res.status(400).json({
        error: "Validation error",
        message: validationError.message,
      });
    }

    await book.save();
    console.log("Book saved successfully with ID:", book._id);
    console.log("=== Add Book Request Complete ===\n");

    res.status(201).json(book);
  } catch (error) {
    console.error("\n=== Add Book Error ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("=====================\n");

    // Send appropriate error response based on error type
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation error",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Error creating book",
      message: error.message || "An unexpected error occurred",
    });
  }
});

// Delete a book
app.delete("/api/books/:id", authenticateToken, async (req, res) => {
  try {
    console.log("\n=== Delete Book Request Start ===");
    console.log("Book ID:", req.params.id);
    console.log("User ID:", req.user.id);

    const bookId = req.params.id;
    const userId = req.user.id;

    // Validate MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error(
        "MongoDB not connected. Current state:",
        mongoose.connection.readyState
      );
      return res.status(503).json({
        error: "Database error",
        message: "Database connection not ready",
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      console.log("Invalid book ID format:", bookId);
      return res.status(400).json({
        error: "Invalid book ID",
        message: "The provided book ID is not valid",
      });
    }

    // Find the book and verify ownership
    const book = await Book.findById(bookId);
    if (!book) {
      console.log("Book not found with ID:", bookId);
      return res.status(404).json({
        error: "Book not found",
        message: "The requested book could not be found",
      });
    }

    // Check if the user owns the book
    if (book.userId.toString() !== userId) {
      console.log("User not authorized to delete book");
      return res.status(403).json({
        error: "Not authorized",
        message: "You are not authorized to delete this book",
      });
    }

    // Delete the book
    await Book.findByIdAndDelete(bookId);
    console.log("Book deleted successfully");
    console.log("=== Delete Book Request Complete ===\n");

    res.json({ message: "Book deleted successfully" });
  } catch (error) {
    console.error("\n=== Delete Book Error ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("=====================\n");

    res.status(500).json({
      error: "Error deleting book",
      message: error.message || "An unexpected error occurred",
    });
  }
});

// Like a book
app.post("/api/books/:id/like", authenticateToken, async (req, res) => {
  const bookId = req.params.id;

  try {
    console.log("\n=== Like Book Request Start ===");
    console.log("Book ID:", bookId);
    console.log("User ID:", req.user.id);

    // Find the book and populate necessary fields
    const book = await Book.findById(bookId)
      .populate("userId", "userId")
      .populate("likes", "userId");

    if (!book) {
      console.error("Book not found with ID:", bookId);
      return res.status(404).json({
        error: "Book not found",
        message: "The requested book could not be found",
      });
    }

    console.log("Found book:", {
      id: book._id,
      title: book.title,
      ownerId: book.userId._id,
    });

    // Check if already liked
    if (book.likes.some((like) => like._id.toString() === req.user.id)) {
      console.log("User has already liked this book");
      return res.status(400).json({
        error: "Already liked",
        message: "You have already liked this book",
      });
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

    if (!currentUser || !bookOwner) {
      console.error("Could not find users:", {
        currentUser: !!currentUser,
        bookOwner: !!bookOwner,
      });
      return res.status(500).json({
        error: "User not found",
        message: "Could not find user information",
      });
    }

    // Check if users already have a chat relationship
    const existingChatPartner = currentUser.chatPartners.find(
      (partner) => partner.partnerId.toString() === book.userId._id.toString()
    );

    if (existingChatPartner) {
      console.log("Found existing chat relationship");
      chatRoom = await ChatRoom.findById(existingChatPartner.chatRoomId);
      if (!chatRoom) {
        console.error("Chat room not found despite existing relationship");
        return res.status(500).json({
          error: "Chat room not found",
          message: "Could not find the existing chat room",
        });
      }
      // Add notification message to existing chat room
      chatRoom.messages.push(notificationMessage);
      await chatRoom.save();
    } else {
      console.log("Creating new chat relationship");
      // Create new chat room with the notification message
      chatRoom = new ChatRoom({
        bookId: book._id,
        participants: [req.user.id, book.userId._id],
        messages: [notificationMessage], // Only add the message once here
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

    // Fetch the final state of the chat room
    const finalChatRoom = await ChatRoom.findById(chatRoom._id)
      .populate("messages.senderId", "userId")
      .populate("participants", "userId");

    if (!finalChatRoom) {
      console.error("Failed to fetch final chat room state");
      return res.status(500).json({
        error: "Chat room error",
        message: "Could not fetch chat room state",
      });
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
        text: msg.message || "",
        senderId: msg.senderId ? msg.senderId.userId : "Unknown",
        timestamp: msg.createdAt
          ? msg.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };

    console.log("Sending response:", response);
    return res.json(response);
  } catch (error) {
    console.error("\n=== Like Book Error ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("=====================\n");
    res.status(500).json({
      error: "Server error",
      message: error.message || "An unexpected error occurred",
    });
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
        path: "messages.senderId",
        select: "userId",
      });

    console.log("Found chat rooms:", chatRooms.length);

    const formattedChatRooms = chatRooms.map((room) => {
      // Format messages to ensure all fields are present
      const formattedMessages = room.messages.map((msg) => {
        const formattedMsg = {
          text: msg.message || "",
          senderId: msg.senderId ? msg.senderId.userId : "Unknown",
          timestamp: msg.createdAt
            ? msg.createdAt.toISOString()
            : new Date().toISOString(),
        };
        console.log("Formatted message:", formattedMsg);
        return formattedMsg;
      });

      const formattedRoom = {
        id: room._id,
        bookTitle: room.bookId ? room.bookId.title : "Unknown Book",
        participants: room.participants.map((p) => ({
          id: p._id,
          userId: p.userId,
        })),
        messages: formattedMessages,
      };

      console.log("Formatted room:", formattedRoom);
      return formattedRoom;
    });

    console.log("=== End Fetching User's Chat Rooms ===");
    res.json(formattedChatRooms);
  } catch (error) {
    console.error("Error fetching user's chat rooms:", error);
    res.status(500).json({
      error: "Error fetching chat rooms",
      message: error.message,
    });
  }
});

// Get specific chat room info
app.get("/api/chatrooms/:id", authenticateToken, async (req, res) => {
  const chatRoomId = req.params.id;

  try {
    console.log("\n=== Fetching Chat Room Details ===");
    console.log("Chat Room ID:", chatRoomId);

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

    console.log("\nRaw chat room data from DB:", {
      id: chatRoom?._id,
      messageCount: chatRoom?.messages?.length,
      firstMessage: chatRoom?.messages?.[0],
      lastMessage: chatRoom?.messages?.[chatRoom?.messages?.length - 1],
    });

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

    // Format the response with proper message formatting
    const formattedMessages = chatRoom.messages.map((msg, index) => {
      console.log(`\nProcessing message ${index}:`, {
        rawMessage: msg.message,
        rawSenderId: msg.senderId,
        rawTimestamp: msg.createdAt,
      });

      const formattedMsg = {
        text: msg.message || "",
        senderId: msg.senderId ? msg.senderId.userId : "Unknown",
        timestamp: msg.createdAt
          ? msg.createdAt.toISOString()
          : new Date().toISOString(),
      };

      console.log(`Formatted message ${index}:`, formattedMsg);
      return formattedMsg;
    });

    const response = {
      _id: chatRoom._id,
      bookTitle: bookTitle,
      participants: chatRoom.participants.map((p) => ({
        _id: p._id,
        userId: p.userId,
      })),
      messages: formattedMessages,
    };

    console.log("\nFinal response:", {
      id: response._id,
      messageCount: response.messages.length,
      firstMessage: response.messages[0],
      lastMessage: response.messages[response.messages.length - 1],
    });

    console.log("=== End Fetching Chat Room Details ===\n");
    return res.json(response);
  } catch (error) {
    console.error("\n=== Error Fetching Chat Room ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("==============================\n");
    return res.status(500).json({
      error: "Error fetching chat room",
      message: error.message,
    });
  }
});

// Get chat room messages
app.get("/api/chatrooms/:id/messages", authenticateToken, async (req, res) => {
  const chatRoomId = req.params.id;

  try {
    console.log("\n=== Fetching Chat Room Messages ===");
    console.log("Chat Room ID:", chatRoomId);

    const chatRoom = await ChatRoom.findById(chatRoomId).populate({
      path: "messages.senderId",
      select: "userId",
    });

    console.log("\nRaw chat room data from DB:", {
      id: chatRoom?._id,
      messageCount: chatRoom?.messages?.length,
      firstMessage: chatRoom?.messages?.[0],
      lastMessage: chatRoom?.messages?.[chatRoom?.messages?.length - 1],
    });

    if (!chatRoom) {
      console.log("Chat room not found with ID:", chatRoomId);
      return res.status(404).json({ error: "Chat room not found" });
    }

    // Format messages to include all necessary fields with proper fallbacks
    const formattedMessages = chatRoom.messages.map((msg, index) => {
      console.log(`\nProcessing message ${index}:`, {
        rawMessage: msg.message,
        rawSenderId: msg.senderId,
        rawTimestamp: msg.createdAt,
      });

      const formattedMsg = {
        text: msg.message || "",
        senderId: msg.senderId ? msg.senderId.userId : "Unknown",
        timestamp: msg.createdAt
          ? msg.createdAt.toISOString()
          : new Date().toISOString(),
      };

      console.log(`Formatted message ${index}:`, formattedMsg);
      return formattedMsg;
    });

    console.log("\nFinal response:", {
      messageCount: formattedMessages.length,
      firstMessage: formattedMessages[0],
      lastMessage: formattedMessages[formattedMessages.length - 1],
    });

    console.log("=== End Fetching Chat Room Messages ===\n");
    res.json(formattedMessages);
  } catch (error) {
    console.error("\n=== Error Fetching Messages ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("=============================\n");
    res
      .status(500)
      .json({ error: "Error fetching messages: " + error.message });
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

// Generate signed URL for upload
app.post("/api/upload/signed-url", async (req, res) => {
  console.log("\n=== Signed URL Request Start ===");
  console.log("Request headers:", req.headers);
  console.log("Request body:", req.body);

  const { fileName, fileType } = req.body;
  if (!fileName || !fileType) {
    console.log("Missing fileName or fileType");
    return res
      .status(400)
      .json({ error: "fileName and fileType are required" });
  }

  try {
    console.log("Generating signed URL for:", { fileName, fileType });

    const options = {
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: fileType,
      cors: [
        {
          origin: ["*"],
          method: ["GET", "HEAD", "PUT", "POST", "DELETE"],
          responseHeader: ["Content-Type", "Access-Control-Allow-Origin"],
          maxAgeSeconds: 3600,
        },
      ],
    };

    console.log("Signed URL options:", options);

    const [signedUrl] = await bucket.file(fileName).getSignedUrl(options);
    // Generate a public URL using storage.googleapis.com
    const publicUrl = `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/${fileName}`;

    console.log("Generated signed URL:", signedUrl);
    console.log("Public URL:", publicUrl);

    const response = { signedUrl, publicUrl };
    console.log("Sending response:", response);
    console.log("=== Signed URL Request Complete ===\n");

    res.json(response);
  } catch (error) {
    console.error("\n=== Error Generating Signed URL ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("================================\n");
    res.status(500).json({ error: "Error generating signed URL" });
  }
});

// Delete file from storage
app.delete("/api/upload/:fileName", authenticateToken, async (req, res) => {
  try {
    console.log("\n=== Deleting File ===");
    console.log("File name:", req.params.fileName);

    const { fileName } = req.params;

    if (!fileName) {
      console.error("Missing fileName");
      return res.status(400).json({
        error: "Missing required field",
        message: "fileName is required",
      });
    }

    await bucket.file(fileName).delete();

    console.log("File deleted successfully");
    console.log("=== End Deleting File ===\n");

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("\n=== Error Deleting File ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("========================\n");

    res.status(500).json({
      error: "Failed to delete file",
      message: error.message,
    });
  }
});

// Add a test route
app.get("/api/test", (req, res) => {
  console.log("Test route hit");
  res.json({ message: "Test route working" });
});

// Update book photo URL
app.put("/api/books/:id/photo", authenticateToken, async (req, res) => {
  try {
    console.log("\n=== Update Book Photo Request Start ===");
    console.log("Book ID:", req.params.id);
    console.log("Request body:", req.body);

    const { photoUrl } = req.body;
    if (!photoUrl) {
      return res.status(400).json({
        error: "Missing photo URL",
        message: "Photo URL is required",
      });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({
        error: "Book not found",
        message: "The requested book could not be found",
      });
    }

    // Verify ownership
    if (book.userId.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Not authorized",
        message: "You are not authorized to update this book",
      });
    }

    book.photoUrl = photoUrl;
    await book.save();

    console.log("Book photo updated successfully");
    console.log("=== Update Book Photo Request Complete ===\n");

    res.json(book);
  } catch (error) {
    console.error("\n=== Update Book Photo Error ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("=====================\n");
    res.status(500).json({
      error: "Error updating book photo",
      message: error.message || "An unexpected error occurred",
    });
  }
});

// Add the new endpoint for loading images as base64
app.post("/api/load-images", authenticateToken, async (req, res) => {
  try {
    console.log("\n=== Loading Images Request Start ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({
        error: "Invalid request",
        message: "images array is required",
      });
    }

    const fetchImagePromises = images.map(async (imageUrl) => {
      try {
        console.log("Fetching image:", imageUrl);
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          headers: {
            Accept: "image/*",
          },
        });

        const contentType = response.headers["content-type"];
        const imageBuffer = Buffer.from(response.data, "binary");
        const base64Image = imageBuffer.toString("base64");
        return `data:${contentType};base64,${base64Image}`;
      } catch (error) {
        console.error("Error fetching image:", imageUrl, error.message);
        return null;
      }
    });

    const base64Images = await Promise.all(fetchImagePromises);
    const validImages = base64Images.filter((img) => img !== null);

    console.log(
      `Successfully converted ${validImages.length} of ${images.length} images`
    );
    console.log("=== Loading Images Request Complete ===\n");

    res.json({ images: validImages });
  } catch (error) {
    console.error("\n=== Error Loading Images ===");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    console.error("===========================\n");
    res.status(500).json({
      error: "Error loading images",
      message: error.message,
    });
  }
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
