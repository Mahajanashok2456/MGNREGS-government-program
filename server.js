// npm install express jsonwebtoken dotenv node-fetch
// Create a .env file in the root directory and add:
// JWT_SECRET=your_jwt_secret_here
// PORT=3000
// CLOUD_API_URL=https://api.example.com/mgnrega-data

const express = require("express");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const path = require("path");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// CONFIG object
const CONFIG = {
  CLOUD_API_URL:
    process.env.CLOUD_API_URL || "https://api.example.com/mgnrega-data",
  MAPPINGS: {
    districtId: "district_code",
    districtName: "district_name",
    peopleEmployed: "Total_Individuals_Worked",
    workAvailabilityValue: "Total_Individuals_Worked", // raw value for analysis
    paymentSpeedValue: "percentage_payments_gererated_within_15_days",
    stateComparisonValue: "Total_Individuals_Worked", // placeholder, could be compared to state avg
    historicalEmployed: "Total_Individuals_Worked", // for simplicity, use array of last 6 values if available
  },
  ANALYSIS_RULES: {
    workAvailability: {
      thresholds: { high: 150000, medium: 75000 },
      labels: { high: "High", medium: "Medium", low: "Low" },
      colors: { high: "green", medium: "yellow", low: "red" },
    },
    paymentSpeed: {
      thresholds: { good: 80, okay: 50 },
      labels: { good: "Good", okay: "Okay", bad: "Bad" },
      colors: { good: "green", okay: "yellow", bad: "red" },
    },
    peopleEmployed: (value) => {
      if (value >= 100000) return `${(value / 100000).toFixed(2)} Lakh`;
      if (value >= 1000) return `${(value / 1000).toFixed(2)} Thousand`;
      return value.toString();
    },
    stateComparison: (value) => {
      // Placeholder: assume "Better" if > 100000, else "Worse"
      return value > 100000 ? "Better" : "Worse";
    },
    stateComparisonColor: (value) => {
      return value > 100000 ? "green" : "red";
    },
  },
  ML_FEATURES: {
    enabled: true, // Master switch to enable/disable all ML features
    linearRegression: true, // Predict missing employment
    classification: true, // Predict payment speed categories
    timeSeriesForecasting: true, // Forecast next month employment
    anomalyDetection: true, // Detect unusual performance
    clustering: true, // Group districts by patterns
  },
};

// Machine Learning Functions
function simpleLinearRegression(x, y) {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] || 0 };

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function predictLinearRegression(x, slope, intercept) {
  return slope * x + intercept;
}

function predictEmploymentMissing(historical) {
  if (!CONFIG.ML_FEATURES.enabled || !CONFIG.ML_FEATURES.linearRegression)
    return null;

  const validData = historical.filter((val) => val > 0);
  if (validData.length < 2) return null;

  const x = Array.from({ length: validData.length }, (_, i) => i + 1);
  const { slope, intercept } = simpleLinearRegression(x, validData);
  const nextX = validData.length + 1;
  return Math.max(0, predictLinearRegression(nextX, slope, intercept));
}

function classifyPaymentSpeed(employment, historical) {
  if (!CONFIG.ML_FEATURES.enabled || !CONFIG.ML_FEATURES.classification)
    return null;

  // Simple rule-based classification based on employment trends
  const avgEmployment =
    historical.reduce((a, b) => a + b, 0) / historical.length;
  const trend = employment > avgEmployment ? "improving" : "declining";

  // Map to payment speed categories based on employment performance
  if (trend === "improving" && employment > 100000) return "Good";
  if (trend === "improving" && employment > 50000) return "Okay";
  return "Bad";
}

function forecastTimeSeries(historical) {
  if (!CONFIG.ML_FEATURES.enabled || !CONFIG.ML_FEATURES.timeSeriesForecasting)
    return null;

  // Simple exponential smoothing
  const alpha = 0.3;
  let smoothed = historical[0];
  for (let i = 1; i < historical.length; i++) {
    smoothed = alpha * historical[i] + (1 - alpha) * smoothed;
  }
  return Math.max(0, smoothed);
}

function detectAnomaly(value, historical) {
  if (!CONFIG.ML_FEATURES.enabled || !CONFIG.ML_FEATURES.anomalyDetection)
    return false;

  const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
  const variance =
    historical.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    historical.length;
  const stdDev = Math.sqrt(variance);
  const zScore = Math.abs((value - mean) / stdDev);
  return zScore > 2; // Anomaly if more than 2 standard deviations
}

function clusterDistricts(districtsData) {
  if (!CONFIG.ML_FEATURES.enabled || !CONFIG.ML_FEATURES.clustering) return {};

  // Simple k-means clustering (k=3) based on employment and payment speed
  const k = 3;
  const centroids = [
    { employment: 150000, paymentSpeed: 80 }, // High performing
    { employment: 75000, paymentSpeed: 50 }, // Medium performing
    { employment: 25000, paymentSpeed: 20 }, // Low performing
  ];

  const clusters = {};
  districtsData.forEach((district) => {
    let minDistance = Infinity;
    let clusterId = 0;

    centroids.forEach((centroid, index) => {
      const distance = Math.sqrt(
        Math.pow(district.employment - centroid.employment, 2) +
          Math.pow(district.paymentSpeed - centroid.paymentSpeed, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        clusterId = index;
      }
    });

    if (!clusters[clusterId]) clusters[clusterId] = [];
    clusters[clusterId].push(district.id);
  });

  return clusters;
}

// Data Quality Helpers
const dataQualityMetrics = {
  totalRows: 0,
  validRows: 0,
  invalidRows: 0,
  skippedDistricts: 0,
  completenessScore: 0,
};

function logDataQuality(message, level = "info") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function isValidString(value) {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "string" &&
    value.trim() !== ""
  );
}

function isValidNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

function parseNumericSafe(value, defaultValue = 0) {
  if (isValidNumeric(value)) {
    return parseFloat(value);
  }
  logDataQuality(
    `Invalid numeric value: ${value}, using default: ${defaultValue}`,
    "warn"
  );
  return defaultValue;
}

function validateDistrictData(row) {
  const districtId = row[CONFIG.MAPPINGS.districtId];
  const districtName = row[CONFIG.MAPPINGS.districtName];
  const peopleEmployed = row[CONFIG.MAPPINGS.peopleEmployed];
  const paymentSpeed = row[CONFIG.MAPPINGS.paymentSpeedValue];

  if (!isValidString(districtId)) {
    logDataQuality(`Invalid districtId: ${districtId}`, "error");
    return false;
  }
  if (!isValidString(districtName)) {
    logDataQuality(
      `Missing districtName for districtId: ${districtId}`,
      "warn"
    );
  }
  if (!isValidNumeric(peopleEmployed)) {
    logDataQuality(
      `Invalid peopleEmployed for districtId: ${districtId}: ${peopleEmployed}`,
      "warn"
    );
  }
  if (!isValidNumeric(paymentSpeed)) {
    logDataQuality(
      `Invalid paymentSpeed for districtId: ${districtId}: ${paymentSpeed}`,
      "warn"
    );
  }
  return true;
}

function calculateCompleteness(row) {
  const requiredFields = [
    CONFIG.MAPPINGS.districtId,
    CONFIG.MAPPINGS.districtName,
    CONFIG.MAPPINGS.peopleEmployed,
    CONFIG.MAPPINGS.paymentSpeedValue,
  ];
  let validFields = 0;
  requiredFields.forEach((field) => {
    if (isValidString(row[field]) || isValidNumeric(row[field])) {
      validFields++;
    }
  });
  return validFields / requiredFields.length;
}

// In-memory data store
let csvData = {};

// Function to load data from cloud API
async function loadDataFromCloud() {
  logDataQuality("Starting cloud data loading process...");
  try {
    const response = await fetch(CONFIG.CLOUD_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    const dataMap = {};
    let rowCount = 0;
    let validRowCount = 0;
    let invalidRowCount = 0;
    let skippedDistricts = 0;

    // Assuming data is an array of rows
    data.forEach((row) => {
      rowCount++;
      const districtId = row[CONFIG.MAPPINGS.districtId];

      // Validate row data
      if (!validateDistrictData(row)) {
        invalidRowCount++;
        skippedDistricts++;
        logDataQuality(
          `Skipping invalid row ${rowCount} for districtId: ${districtId}`,
          "warn"
        );
        return;
      }

      validRowCount++;
      logDataQuality(
        `Processing row ${rowCount}: districtId=${districtId}, districtName=${
          row[CONFIG.MAPPINGS.districtName] || "N/A"
        }, peopleEmployed=${
          row[CONFIG.MAPPINGS.peopleEmployed] || "N/A"
        }, paymentSpeed=${row[CONFIG.MAPPINGS.paymentSpeedValue] || "N/A"}`
      );

      if (!dataMap[districtId]) {
        dataMap[districtId] = [];
      }
      dataMap[districtId].push(row);
    });

    logDataQuality(
      `Cloud data parsing completed. Total rows: ${rowCount}, Valid: ${validRowCount}, Invalid: ${invalidRowCount}`
    );
    logDataQuality(
      `Total districts found: ${
        Object.keys(dataMap).length
      }, Skipped districts: ${skippedDistricts}`
    );

    // Update metrics
    dataQualityMetrics.totalRows = rowCount;
    dataQualityMetrics.validRows = validRowCount;
    dataQualityMetrics.invalidRows = invalidRowCount;
    dataQualityMetrics.skippedDistricts = skippedDistricts;
    dataQualityMetrics.completenessScore = (validRowCount / rowCount) * 100;

    // Sort by month descending and take latest or aggregate
    for (const districtId in dataMap) {
      dataMap[districtId].sort((a, b) => b.month.localeCompare(a.month));
      // For simplicity, take the latest entry
      const latest = dataMap[districtId][0];
      logDataQuality(
        `District ${districtId}: Latest entry month=${
          latest.month || "N/A"
        }, peopleEmployed=${
          latest[CONFIG.MAPPINGS.peopleEmployed] || "N/A"
        }, paymentSpeed=${latest[CONFIG.MAPPINGS.paymentSpeedValue] || "N/A"}`
      );

      // For historical, take last 6 if available, else repeat latest with safe parsing
      const historical = dataMap[districtId]
        .slice(0, 6)
        .map((r) => parseNumericSafe(r[CONFIG.MAPPINGS.peopleEmployed], 0));
      while (historical.length < 6) historical.push(historical[0] || 0);

      csvData[districtId] = {
        raw: latest,
        historicalEmployed: historical,
      };
    }

    logDataQuality("Cloud data loaded into memory successfully");
    logDataQuality(
      `Data completeness: ${dataQualityMetrics.completenessScore.toFixed(2)}%`
    );

    // Alert if completeness is low
    if (dataQualityMetrics.completenessScore < 80) {
      logDataQuality(
        `ALERT: Data completeness is low (${dataQualityMetrics.completenessScore.toFixed(
          2
        )}%). Check data source.`,
        "error"
      );
    }
  } catch (error) {
    logDataQuality(`Error loading cloud data: ${error.message}`, "error");
  }
}

// Load data from cloud on start
loadDataFromCloud();

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "Access denied. No token provided." });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    req.user = decoded;
    next();
  });
};

// Public endpoint to generate guest JWT
app.get("/api/auth/token", (req, res) => {
  try {
    const payload = { role: "guest" };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate token." });
  }
});

// Route to serve index.html at root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
// Protected endpoint to fetch list of districts
app.get("/api/districts", verifyToken, (req, res) => {
  try {
    const districts = Object.keys(csvData)
      .filter(
        (districtId) =>
          csvData[districtId].raw["state_name"] === "UTTAR PRADESH"
      )
      .map((districtId) => {
        const raw = csvData[districtId].raw;
        return {
          id: districtId,
          name: isValidString(raw[CONFIG.MAPPINGS.districtName])
            ? raw[CONFIG.MAPPINGS.districtName]
            : districtId,
        };
      });
    res.json(districts);
  } catch (error) {
    logDataQuality(`Error fetching districts: ${error.message}`, "error");
    res.status(500).json({ error: "Failed to fetch districts." });
  }
});

// Protected endpoint to fetch district data
app.get("/api/data/:districtId", verifyToken, (req, res) => {
  try {
    const { districtId } = req.params;
    const districtData = csvData[districtId];
    if (!districtData)
      return res.status(404).json({ error: "District not found." });

    // Apply transformations on-the-fly with safe parsing
    const raw = districtData.raw;
    const workAvailabilityValue = parseNumericSafe(
      raw[CONFIG.MAPPINGS.workAvailabilityValue],
      0
    );
    const paymentSpeedValue = parseNumericSafe(
      raw[CONFIG.MAPPINGS.paymentSpeedValue],
      0
    );
    const peopleEmployedValue = parseNumericSafe(
      raw[CONFIG.MAPPINGS.peopleEmployed],
      0
    );
    const stateComparisonValue = parseNumericSafe(
      raw[CONFIG.MAPPINGS.stateComparisonValue],
      0
    );

    // ML predictions for missing data
    const predictedEmployment =
      peopleEmployedValue === 0
        ? predictEmploymentMissing(districtData.historicalEmployed)
        : null;
    const predictedPaymentSpeed =
      paymentSpeedValue === 0
        ? classifyPaymentSpeed(
            peopleEmployedValue || predictedEmployment || 0,
            districtData.historicalEmployed
          )
        : null;
    const forecastedEmployment = forecastTimeSeries(
      districtData.historicalEmployed
    );
    const isAnomaly = detectAnomaly(
      peopleEmployedValue || predictedEmployment || 0,
      districtData.historicalEmployed
    );

    const transformed = {
      workAvailability:
        workAvailabilityValue > 0
          ? CONFIG.ANALYSIS_RULES.workAvailability.labels[
              workAvailabilityValue >
              CONFIG.ANALYSIS_RULES.workAvailability.thresholds.high
                ? "high"
                : workAvailabilityValue >
                  CONFIG.ANALYSIS_RULES.workAvailability.thresholds.medium
                ? "medium"
                : "low"
            ]
          : "Data Not Available",
      workAvailabilityColor:
        workAvailabilityValue > 0
          ? CONFIG.ANALYSIS_RULES.workAvailability.colors[
              workAvailabilityValue >
              CONFIG.ANALYSIS_RULES.workAvailability.thresholds.high
                ? "high"
                : workAvailabilityValue >
                  CONFIG.ANALYSIS_RULES.workAvailability.thresholds.medium
                ? "medium"
                : "low"
            ]
          : "gray",
      paymentSpeed:
        paymentSpeedValue > 0
          ? CONFIG.ANALYSIS_RULES.paymentSpeed.labels[
              paymentSpeedValue >
              CONFIG.ANALYSIS_RULES.paymentSpeed.thresholds.good
                ? "good"
                : paymentSpeedValue >
                  CONFIG.ANALYSIS_RULES.paymentSpeed.thresholds.okay
                ? "okay"
                : "bad"
            ]
          : predictedPaymentSpeed || "Data Not Available",
      paymentSpeedColor:
        paymentSpeedValue > 0
          ? CONFIG.ANALYSIS_RULES.paymentSpeed.colors[
              paymentSpeedValue >
              CONFIG.ANALYSIS_RULES.paymentSpeed.thresholds.good
                ? "good"
                : paymentSpeedValue >
                  CONFIG.ANALYSIS_RULES.paymentSpeed.thresholds.okay
                ? "okay"
                : "bad"
            ]
          : predictedPaymentSpeed
          ? "blue"
          : "gray",
      peopleEmployed:
        peopleEmployedValue > 0
          ? CONFIG.ANALYSIS_RULES.peopleEmployed(peopleEmployedValue)
          : predictedEmployment
          ? CONFIG.ANALYSIS_RULES.peopleEmployed(predictedEmployment) +
            " (Predicted)"
          : "Data Not Available",
      stateComparison:
        stateComparisonValue > 0
          ? CONFIG.ANALYSIS_RULES.stateComparison(stateComparisonValue)
          : "Data Not Available",
      stateComparisonColor:
        stateComparisonValue > 0
          ? CONFIG.ANALYSIS_RULES.stateComparisonColor(stateComparisonValue)
          : "gray",
      historicalEmployed: districtData.historicalEmployed,
      mlInsights: {
        predictedEmployment: predictedEmployment,
        predictedPaymentSpeed: predictedPaymentSpeed,
        forecastedEmployment: forecastedEmployment,
        isAnomaly: isAnomaly,
        anomalyAlert: isAnomaly
          ? "Unusual district performance detected"
          : null,
      },
      helpText: {
        workAvailability:
          "This shows if enough work is being created for eligible applicants in the district.",
        paymentSpeed:
          "This indicates how quickly payments are processed and disbursed to workers.",
        peopleEmployed:
          "Number of people employed under MGNREGA in the district.",
        stateComparison:
          "Comparison of district performance against the state average.",
        historicalEmployed: "Employment trend over the last 6 months.",
        mlInsights:
          "Machine learning predictions and insights for missing data and trends.",
      },
    };

    res.json(transformed);
  } catch (error) {
    logDataQuality(
      `Error fetching data for district ${req.params.districtId}: ${error.message}`,
      "error"
    );
    res.status(500).json({ error: "Failed to fetch data." });
  }
});

// Route to handle favicon.ico requests
app.get("/favicon.ico", (req, res) => {
  res.status(204).end(); // No Content response to prevent 404
});

// Secure data-refresh endpoint
app.post("/api/data-refresh", verifyToken, async (req, res) => {
  try {
    await loadDataFromCloud();
    res.json({
      message: "Data refreshed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logDataQuality(`Error refreshing data: ${error.message}`, "error");
    res.status(500).json({ error: "Failed to refresh data." });
  }
});

// ML API endpoints
app.get("/api/ml/predict-employment/:districtId", verifyToken, (req, res) => {
  try {
    const { districtId } = req.params;
    const districtData = csvData[districtId];
    if (!districtData)
      return res.status(404).json({ error: "District not found." });

    const prediction = predictEmploymentMissing(
      districtData.historicalEmployed
    );
    res.json({
      districtId,
      predictedEmployment: prediction,
      method: "linear_regression",
      confidence: prediction ? "medium" : "low",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to predict employment." });
  }
});

app.get("/api/ml/classify-payment/:districtId", verifyToken, (req, res) => {
  try {
    const { districtId } = req.params;
    const districtData = csvData[districtId];
    if (!districtData)
      return res.status(404).json({ error: "District not found." });

    const raw = districtData.raw;
    const employment = parseNumericSafe(raw[CONFIG.MAPPINGS.peopleEmployed], 0);
    const classification = classifyPaymentSpeed(
      employment,
      districtData.historicalEmployed
    );

    res.json({
      districtId,
      predictedPaymentSpeed: classification,
      method: "rule_based_classification",
      confidence: classification ? "medium" : "low",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to classify payment speed." });
  }
});

app.get("/api/ml/forecast-employment/:districtId", verifyToken, (req, res) => {
  try {
    const { districtId } = req.params;
    const districtData = csvData[districtId];
    if (!districtData)
      return res.status(404).json({ error: "District not found." });

    const forecast = forecastTimeSeries(districtData.historicalEmployed);
    res.json({
      districtId,
      forecastedEmployment: forecast,
      method: "exponential_smoothing",
      confidence: "medium",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to forecast employment." });
  }
});

app.get("/api/ml/detect-anomaly/:districtId", verifyToken, (req, res) => {
  try {
    const { districtId } = req.params;
    const districtData = csvData[districtId];
    if (!districtData)
      return res.status(404).json({ error: "District not found." });

    const raw = districtData.raw;
    const employment = parseNumericSafe(raw[CONFIG.MAPPINGS.peopleEmployed], 0);
    const isAnomaly = detectAnomaly(
      employment,
      districtData.historicalEmployed
    );

    res.json({
      districtId,
      isAnomaly,
      method: "z_score_detection",
      threshold: "2_std_deviations",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to detect anomaly." });
  }
});

app.get("/api/ml/cluster-districts", verifyToken, (req, res) => {
  try {
    const districtsData = Object.keys(csvData).map((districtId) => {
      const raw = csvData[districtId].raw;
      return {
        id: districtId,
        employment: parseNumericSafe(raw[CONFIG.MAPPINGS.peopleEmployed], 0),
        paymentSpeed: parseNumericSafe(
          raw[CONFIG.MAPPINGS.paymentSpeedValue],
          0
        ),
      };
    });

    const clusters = clusterDistricts(districtsData);
    res.json({
      clusters,
      method: "k_means_clustering",
      k: 3,
      clusterLabels: {
        0: "High Performing",
        1: "Medium Performing",
        2: "Low Performing",
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to cluster districts." });
  }
});

app.get("/api/ml/config", verifyToken, (req, res) => {
  res.json(CONFIG.ML_FEATURES);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Endpoint to get data quality metrics
app.get("/api/data-quality", verifyToken, (req, res) => {
  try {
    res.json({
      metrics: dataQualityMetrics,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logDataQuality(
      `Error fetching data quality metrics: ${error.message}`,
      "error"
    );
    res.status(500).json({ error: "Failed to fetch data quality metrics." });
  }
});

// Start server
app.listen(PORT, () => {
  logDataQuality(`Server running on port ${PORT}`);
});
