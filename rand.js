// Convert Unix timestamp to milliseconds
const timestampInMillis = Date.now();

// Create a new Date object using the timestamp in milliseconds
const date = new Date(timestampInMillis);

// Format the date and time in IST
const formattedDate = date.toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "long",
  timeStyle: "medium",
});

console.log(formattedDate);
