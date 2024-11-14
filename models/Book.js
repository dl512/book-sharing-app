const mongoose = require("mongoose");

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
    chatRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" }, // Add chatRoomId field
  },
  { timestamps: true }
);

module.exports = mongoose.model("Book", bookSchema);
