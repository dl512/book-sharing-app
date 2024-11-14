const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      minlength: 3, // Minimum length for userId
    },
    password: {
      type: String,
      required: true,
      minlength: 6, // Minimum password length
    },
  },
  { timestamps: true }
); // Automatically manage createdAt and updatedAt

module.exports = mongoose.model("User", userSchema);
