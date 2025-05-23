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
  async function likeBook(bookId, bookContainer, buttonContainer) {
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

      // Remove the like button from the button container
      const likeButton = bookContainer.querySelector(".like-button");
      if (likeButton) {
        bookContainer.removeChild(likeButton); // Remove the like button
      }

      if (book && Array.isArray(book.chatRoomIds)) {
        const ownerUserId = book.userId; // Assuming userId is populated correctly

        console.log(book.chatRoomIds);
        const chatRoomId = book.chatRoomIds[book.chatRoomIds.length - 1]; // Get the first chat room ID

        if (chatRoomId) {
          displaySingleChatRoomDropdown(
            bookContainer,
            buttonContainer,
            chatRoomId,
            ownerUserId
          );
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
  function displaySingleChatRoomDropdown(
    bookContainer,
    buttonContainer,
    chatRoomId,
    userId
  ) {
    const dropdown = document.createElement("select");
    dropdown.className = "chat-dropdown";
    dropdown.innerHTML = `<option value="">Chat with...</option>`; // Default option

    const option = document.createElement("option");
    option.value = chatRoomId; // Set the chat room ID as the value
    option.textContent = `${userId}`; // Display user ID
    dropdown.appendChild(option);

    // Create a button to open the chat room
    const openChatButton = document.createElement("button");
    openChatButton.textContent = "Chat";
    openChatButton.className = "chat-button";

    // Set up the click event for the button
    openChatButton.onclick = () => {
      const selectedChatRoomId = dropdown.value;
      if (selectedChatRoomId) {
        const url = `chat-room.html?id=${selectedChatRoomId}`;
        window.open(url, "_blank"); // Open in a new tab
      }
    };

    buttonContainer.appendChild(dropdown);
    buttonContainer.appendChild(openChatButton);
    bookContainer.appendChild(buttonContainer);
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

    // Filter books to only show books from others that haven't been liked by the current user
    const filteredBooks = books.filter((book) => {
      const isFromOtherUser = book.userId._id !== userId;
      const hasNotLiked = !book.likes.some((like) => like._id === userId);
      return isFromOtherUser && hasNotLiked;
    });

    if (filteredBooks.length === 0) {
      const noBooksMessage = document.createElement("div");
      noBooksMessage.className = "no-books-message";
      noBooksMessage.textContent = "No new books to discover at the moment.";
      bookList.appendChild(noBooksMessage);
      return;
    }

    filteredBooks.forEach((book) => {
      const bookContainer = document.createElement("div");
      bookContainer.className = "book-container";

      const buttonContainer = document.createElement("div");
      buttonContainer.className = "button-container";

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

      // Create like button
      const likeButton = document.createElement("button");
      likeButton.textContent = `Like`;
      likeButton.className = "like-button";
      likeButton.onclick = () =>
        likeBook(book._id, bookContainer, buttonContainer);
      bookContainer.appendChild(likeButton);

      bookList.appendChild(bookContainer);
    });
  }

  // Function to display the chat room dropdown
  function displayChatRoomDropdown(
    bookContainer,
    buttonContainer,
    chatRooms,
    userIds
  ) {
    const dropdown = document.createElement("select");
    dropdown.className = "chat-dropdown";
    dropdown.innerHTML = `<option value="">Chat with...</option>`; // Default option

    chatRooms.forEach((room, index) => {
      const option = document.createElement("option");
      option.value = room._id; // Set the chat room ID as the value
      option.textContent = userIds[index] || "Unknown User"; // Use "Unknown User" if userIds[index] is undefined
      dropdown.appendChild(option);
    });

    // Create a button to open the chat room
    const openChatButton = document.createElement("button");
    openChatButton.textContent = "Chat";
    openChatButton.className = "chat-button";

    // Set up the click event for the button
    openChatButton.onclick = () => {
      const selectedChatRoomId = dropdown.value;
      if (selectedChatRoomId) {
        const url = `chat-room.html?id=${selectedChatRoomId}`;
        window.open(url, "_blank"); // Open in a new tab
      }
    };

    // Append the dropdown and button to the container
    buttonContainer.appendChild(dropdown);
    buttonContainer.appendChild(openChatButton);
    bookContainer.appendChild(buttonContainer);
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
  async function loadMessages() {
    try {
      const token = localStorage.getItem("token");
      const chatRoomId = new URLSearchParams(window.location.search).get("id");

      if (!token || !chatRoomId) {
        throw new Error("Missing token or chat room ID");
      }

      const response = await fetch(
        `https://book-sharing-app.onrender.com/api/chatrooms/${chatRoomId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load messages");
      }

      const messages = await response.json();
      const userId = JSON.parse(atob(token.split(".")[1])).id;

      console.log("Fetched messages:", messages);

      const container = document.getElementById("messages-container");
      container.innerHTML = messages
        .map((message) => {
          const isSent = message.senderId === userId;
          const time = new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return `
            <div class="message ${isSent ? "sent" : "received"}">
              <div class="message-content">${message.message}</div>
              <div class="message-time">${time}</div>
            </div>
          `;
        })
        .join("");

      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    } catch (error) {
      console.error("Error loading messages:", error);
      const container = document.getElementById("messages-container");
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #e74c3c;">
          <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 10px;"></i>
          <p style="font-size: 18px; margin-bottom: 10px;">Error loading messages</p>
          <p style="font-size: 14px; color: #7f8c8d;">Please try again later</p>
        </div>
      `;
    }
  }

  // Chat Room Functionality
  if (window.location.pathname.includes("chat-room.html")) {
    let currentChatRoomId = null;
    let currentBookTitle = null;
    let otherParticipant = null;

    // Get chat room ID from URL and decode it
    const urlParams = new URLSearchParams(window.location.search);
    currentChatRoomId = decodeURIComponent(urlParams.get("id"));

    if (!currentChatRoomId) {
      console.error("No chat room ID provided in URL");
      window.location.href = "sharing.html";
      return;
    }

    // Validate chat room ID format
    if (!/^[0-9a-fA-F]{24}$/.test(currentChatRoomId)) {
      console.error("Invalid chat room ID format:", currentChatRoomId);
      window.location.href = "sharing.html";
      return;
    }

    async function loadChatRoomInfo() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const chatRoomId = urlParams.get("id");
        const token = localStorage.getItem("token");
        const userId = JSON.parse(atob(token.split(".")[1])).id;

        if (!chatRoomId) {
          console.error("No chat room ID provided");
          return;
        }

        const response = await fetch(
          `https://book-sharing-app.onrender.com/api/chatrooms/${chatRoomId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch chat room info");
        }

        const chatRoom = await response.json();
        console.log("Chat room info:", chatRoom);

        // Find the other participant's info
        const otherParticipant = chatRoom.participants.find(
          (p) => p._id !== userId
        );

        // Update the chat title with the other participant's name
        document.getElementById("chat-title").textContent = otherParticipant
          ? otherParticipant.userId
          : "Unknown User";
        document.getElementById("chat-subtitle").textContent = ""; // Remove online status

        // Load messages
        await loadMessages();
      } catch (error) {
        console.error("Error loading chat room info:", error);
        document.getElementById("chat-title").textContent = "Error";
        document.getElementById("chat-subtitle").textContent =
          "Failed to load chat";
      }
    }

    async function sendMessage() {
      const input = document.getElementById("message-input");
      const message = input.value.trim();

      if (!message) return;

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `https://book-sharing-app.onrender.com/api/chatrooms/${currentChatRoomId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        // Clear input
        input.value = "";

        // Reload messages
        await loadMessages();
      } catch (error) {
        console.error("Error sending message:", error);
        alert("Error sending message. Please try again.");
      }
    }

    // Add event listener for Enter key
    document
      .getElementById("message-input")
      .addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
          sendMessage();
        }
      });

    // Load chat room info when page loads
    window.onload = () => {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "login.html";
      } else {
        loadChatRoomInfo();
      }
    };
  }

  // Load books when the page is sharing.html
  if (window.location.pathname.includes("sharing.html")) {
    loadBooks();
  }
});
