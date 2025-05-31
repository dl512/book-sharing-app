// Google Cloud Storage configuration
const BUCKET_NAME = "book-sharing-app-images";
const API_ENDPOINT = "https://storage.googleapis.com";

// Function to get a signed URL for uploading
async function getSignedUrl(fileName, fileType) {
  try {
    console.log("Getting signed URL for:", { fileName, fileType });

    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("No authentication token found");
    }

    const response = await fetch(
      "https://book-sharing-app.onrender.com/api/upload/signed-url",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName,
          fileType,
        }),
      }
    );

    console.log("Signed URL response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error response:", errorData);
      throw new Error(errorData.message || "Failed to get signed URL");
    }

    const data = await response.json();
    console.log("Received signed URL data:", data);
    return data;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

// Function to upload file to Google Cloud Storage
async function uploadToCloud(file) {
  try {
    console.log("Starting file upload:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Generate a unique file name
    const fileName = `${Date.now()}-${file.name.replace(
      /[^a-zA-Z0-9.-]/g,
      "_"
    )}`;
    console.log("Generated file name:", fileName);

    // Get signed URL
    const { signedUrl, publicUrl } = await getSignedUrl(fileName, file.type);
    console.log("Got signed URL:", signedUrl);

    // Upload file using signed URL
    console.log("Uploading file to signed URL...");
    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    console.log("Upload response status:", uploadResponse.status);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload error response:", errorText);
      throw new Error("Failed to upload file");
    }

    console.log("File uploaded successfully. Public URL:", publicUrl);
    return publicUrl;
  } catch (error) {
    console.error("Error uploading to cloud:", error);
    throw error;
  }
}

// Function to delete file from Google Cloud Storage
async function deleteFromCloud(fileUrl) {
  try {
    console.log("Deleting file:", fileUrl);

    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("No authentication token found");
    }

    const fileName = fileUrl.split("/").pop();
    console.log("Extracted file name:", fileName);

    const response = await fetch(
      `https://book-sharing-app.onrender.com/api/upload/${fileName}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("Delete response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Delete error response:", errorData);
      throw new Error(errorData.message || "Failed to delete file");
    }

    console.log("File deleted successfully");
    return true;
  } catch (error) {
    console.error("Error deleting from cloud:", error);
    throw error;
  }
}
