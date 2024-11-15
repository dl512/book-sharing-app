// Register user
document.addEventListener("DOMContentLoaded", () => {
  // Register form submission
  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = document.getElementById("register-userid").value;
      const password = document.getElementById("register-password").value;

      const response = await fetch(
        "https://book-sharing-app.onrender.com/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId, password }),
        }
      );

      const data = await response.text();
      alert(data);
    });
  }

  // Login user
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = document.getElementById("login-userid").value;
      const password = document.getElementById("login-password").value;

      const response = await fetch(
        "https://book-sharing-app.onrender.com/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId, password }),
        }
      );

      if (response.ok) {
        const { token } = await response.json();
        localStorage.setItem("token", token);
        console.log("Token stored:", token);
        // Redirect to sharing page after successful login
        window.location.href = "sharing.html";
      } else {
        alert("Login failed");
      }
    });
  }

  // Share a book
  const bookForm = document.getElementById("book-form");
  if (bookForm) {
    bookForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("book-title").value;
      const author = document.getElementById("book-author").value;
      const description = document.getElementById("book-description").value;

      const token = localStorage.getItem("token");

      const response = await fetch(
        "https://book-sharing-app.onrender.com/api/books",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, author, description }),
        }
      );

      const data = await response.text();
      alert(data); // Show server response

      if (response.ok) {
        loadBooks(); // Reload books after sharing only if successful
      }
    });
  }

  // Function to handle liking a book
  async function likeBook(bookId, bookContainer) {
    const token = localStorage.getItem("token");
    const likeResponse = await fetch(
      `https://book-sharing-app.onrender.com/api/books/${bookId}/like`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (likeResponse.ok) {
      const book = await likeResponse.json();
      console.log("Book data after liking:", book);

      if (book && Array.isArray(book.chatRoomIds)) {
        const ownerUserId = book.userId; // Assuming userId is populated correctly

        console.log(book.chatRoomIds);
        const chatRoomId = book.chatRoomIds[book.chatRoomIds.length - 1]; // Get the first chat room ID

        if (chatRoomId) {
          displaySingleChatRoomDropdown(bookContainer, chatRoomId, ownerUserId);
        }
      } else {
        console.error("Book data is not in the expected format:", book);
        alert("Error: Received unexpected book data.");
      }
    } else {
      alert("Error liking book");
    }
  }

  // Function to display a single chat room dropdown
  function displaySingleChatRoomDropdown(bookContainer, chatRoomId, userId) {
    const dropdown = document.createElement("select");
    dropdown.className = "chat-dropdown";
    dropdown.innerHTML = `<option value="">Chat with...</option>`; // Default option

    const option = document.createElement("option");
    option.value = chatRoomId; // Set the chat room ID as the value
    option.textContent = `${userId}`; // Display user ID
    dropdown.appendChild(option);

    dropdown.addEventListener("change", (e) => {
      const selectedChatRoomId = e.target.value;
      if (selectedChatRoomId) {
        // Create an anchor element
        const anchor = document.createElement("a");
        anchor.href = `chatroom.html?id=${selectedChatRoomId}`;
        anchor.target = "_blank"; // Open in a new tab
        anchor.click(); // Simulate a click on the anchor
      }
    });

    bookContainer.appendChild(dropdown);
  }

  async function loadBooks() {
    const token = localStorage.getItem("token");
    console.log("Loading books with token:", token);

    if (!token) {
      alert("You must be logged in to load books.");
      return;
    }

    const response = await fetch(
      "https://book-sharing-app.onrender.com/api/books",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error loading books:", response.status, errorText);
      alert("Error loading books: " + errorText);
      return;
    }

    const books = await response.json();
    console.log("Books loaded:", books);

    const bookList = document.getElementById("book-list");
    bookList.innerHTML = ""; // Clear the list before adding new items

    const userId = JSON.parse(atob(token.split(".")[1])).id; // Decode token to get user ID
    console.log("Current User ID:", userId); // Log current user ID

    books.forEach((book) => {
      const likeCount = Array.isArray(book.likes) ? book.likes.length : 0;

      const bookContainer = document.createElement("div");
      bookContainer.className = "book-container";

      // Create the title and author section
      const titleAuthor = document.createElement("div");
      titleAuthor.className = "title-author";
      titleAuthor.textContent = `${book.title} by ${book.author}`;
      bookContainer.appendChild(titleAuthor);

      // Create the description section
      const description = document.createElement("div");
      description.className = "description";
      description.textContent = book.description;
      bookContainer.appendChild(description);

      // Create like button only if the user is not the owner
      if (book.userId._id !== userId) {
        const likeButton = document.createElement("button");
        likeButton.textContent = `Like`;
        likeButton.className = "like-button";

        likeButton.onclick = () => likeBook(book._id, bookContainer);
        bookContainer.appendChild(likeButton);
      }

      // Logic for displaying chat room dropdown
      if (book.userId._id === userId) {
        const userIds = book.likes.map((like) => like.userId);
        const chatRoomIds = book.chatRoomIds;

        if (chatRoomIds.length > 0) {
          displayChatRoomDropdown(bookContainer, chatRoomIds, userIds);
        }
      } else {
        const hasLiked = book.likes.some((like) => like._id === userId);
        if (hasLiked) {
          const chatRoomIds = book.chatRoomIds.filter(
            (room) =>
              room.participants.includes(userId) &&
              room.participants.includes(book.userId._id)
          );

          if (chatRoomIds.length > 0) {
            displaySingleChatRoomDropdown(
              bookContainer,
              chatRoomIds[0]._id,
              book.userId.userId
            );
          }
        }
      }

      bookList.appendChild(bookContainer);
    });
  }

  // Function to display the chat room dropdown
  function displayChatRoomDropdown(bookContainer, chatRooms, userIds) {
    const dropdown = document.createElement("select");
    dropdown.className = "chat-dropdown";
    dropdown.innerHTML = `<option value="">Chat with...</option>`; // Default option

    chatRooms.forEach((room, index) => {
      const option = document.createElement("option");
      option.value = room._id; // Set the chat room ID as the value
      option.textContent = userIds[index] || "Unknown User"; // Use "Unknown User" if userIds[index] is undefined
      dropdown.appendChild(option);
    });

    dropdown.addEventListener("change", (e) => {
      const selectedChatRoomId = e.target.value;
      console.log("Dropdown changed:", selectedChatRoomId); // Debug log
      if (selectedChatRoomId) {
        // Create an anchor element
        const anchor = document.createElement("a");
        anchor.href = `chatroom.html?id=${selectedChatRoomId}`;
        anchor.target = "_blank"; // Open in a new tab

        // Append the anchor to the body (not visible)
        document.body.appendChild(anchor);

        // Simulate a click on the anchor
        anchor.click();

        // Clean up by removing the anchor
        document.body.removeChild(anchor);
      }
    });

    bookContainer.appendChild(dropdown);
  }

  // Logout user
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("token"); // Remove token from local storage
      // Redirect to login page
      window.location.href = "index.html"; // Redirect to login page
    });
  }

  // Load chat messages
  async function loadChatMessages() {
    const token = localStorage.getItem("token");
    const chatRoomId = new URLSearchParams(window.location.search).get("id"); // Get chat room ID from URL

    try {
      const response = await fetch(
        `https://book-sharing-app.onrender.com/api/chatrooms/${chatRoomId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load messages");
      }

      const messages = await response.json();

      console.log("Fetched messages:", messages); // Log the fetched messages

      const messageList = document.getElementById("message-list");
      messageList.innerHTML = "";
      messages.forEach((msg) => {
        const li = document.createElement("li");

        console.log("Message object:", msg);

        const senderId = msg.senderId ? msg.senderId.userId : "Unknown User"; // Check if senderId is populated
        li.textContent = `${senderId}: ${msg.message}`; // Display sender's user ID
        messageList.appendChild(li);
      });
    } catch (error) {
      console.error("Error loading messages:", error);
      alert("Error loading messages");
    }
  }

  // Load messages when the page loads (if on chat room page)
  if (window.location.pathname.includes("chatroom.html")) {
    loadChatMessages();
  }

  // Send message handler
  const sendMessageButton = document.getElementById("send-message-button");
  if (sendMessageButton) {
    sendMessageButton.addEventListener("click", async () => {
      const message = document.getElementById("message-input").value;
      const chatRoomId = new URLSearchParams(window.location.search).get("id"); // Get chat room ID from URL
      const token = localStorage.getItem("token");

      if (!message.trim()) {
        alert("Please enter a message");
        return;
      }

      const senderId = JSON.parse(atob(token.split(".")[1])).id; // Get current user ID from the token

      const response = await fetch(
        `https://book-sharing-app.onrender.com/api/chatrooms/${chatRoomId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ senderId, message }), // Include senderId in the body
        }
      );

      if (response.ok) {
        document.getElementById("message-input").value = ""; // Clear input
        loadChatMessages(); // Reload messages
      } else {
        alert("Error sending message");
      }
    });
  }

  // Load books when the page is sharing.html
  if (window.location.pathname.includes("sharing.html")) {
    loadBooks();
  }
});
