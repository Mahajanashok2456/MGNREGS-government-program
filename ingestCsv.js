const { MongoClient } = require("mongodb");
const csv = require("csv-parser");
const fs = require("fs");
require("dotenv").config();

// Environment variable for MongoDB connection string
const mongoUri = process.env.MONGO_URI;
const dbName = "mgnrega_db";
const collectionName = "districts";

async function ingestCsvData() {
  let client;

  try {
    // Connect to MongoDB
    client = new MongoClient(mongoUri);
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Clear the collection to prevent duplicates
    await collection.deleteMany({});
    console.log("Cleared existing data from districts collection");

    const data = [];

    // Read and parse CSV
    fs.createReadStream("data.csv")
      .pipe(csv())
      .on("data", (row) => {
        // Transform CSV row back to nested JSON structure
        const transformedRow = {
          districtId: row.districtId,
          districtName: row.districtName,
          state: row.state,
          metrics: {
            workAvailability: {
              value: row.workAvailability_value,
              color: row.workAvailability_color,
              helpText: row.workAvailability_helpText,
            },
            paymentSpeed: {
              value: row.paymentSpeed_value,
              color: row.paymentSpeed_color,
              helpText: row.paymentSpeed_helpText,
            },
            peopleEmployed: {
              value: row.peopleEmployed_value,
              color: row.peopleEmployed_color || null,
              helpText: row.peopleEmployed_helpText,
            },
            stateComparison: {
              value: row.stateComparison_value,
              color: row.stateComparison_color,
              helpText: row.stateComparison_helpText,
            },
          },
          historicalEmployed: JSON.parse(row.historicalEmployed),
          lastUpdated: new Date(row.lastUpdated),
        };
        data.push(transformedRow);
      })
      .on("end", async () => {
        // Insert the transformed data
        const result = await collection.insertMany(data);
        console.log(
          `Inserted ${result.insertedCount} documents into ${collectionName} collection`
        );

        // Close the connection
        await client.close();
        console.log("Disconnected from MongoDB");
      })
      .on("error", (error) => {
        console.error("Error reading CSV:", error);
        process.exit(1);
      });
  } catch (error) {
    console.error("Error ingesting CSV data:", error);
    process.exit(1);
  }
}

// Run the ingest function
ingestCsvData();
