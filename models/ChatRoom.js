const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userId: {
      // New field to store the user's id
      type: String, // Assuming userId is a String
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
      required: true,
      ref: "Book",
      index: true, // Add index for performance
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true, // Add index for performance
      },
    ],
    messages: [messageSchema],
  },
  { timestamps: true } // Automatically manage createdAt and updatedAt
);

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
