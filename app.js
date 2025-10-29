// Mock database simulating Firestore
const mockDB = {
  up_lucknow: {
    workAvailability: "High",
    workAvailabilityColor: "green",
    paymentSpeed: "Good",
    paymentSpeedColor: "green",
    peopleEmployed: "1.45 Lakh",
    stateComparison: "Better",
    stateComparisonColor: "green",
    historicalEmployed: [12000, 13000, 12500, 14000, 13500, 14500],
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
    },
  },
  up_varanasi: {
    workAvailability: "Medium",
    workAvailabilityColor: "yellow",
    paymentSpeed: "Okay",
    paymentSpeedColor: "yellow",
    peopleEmployed: "1.20 Lakh",
    stateComparison: "Worse",
    stateComparisonColor: "red",
    historicalEmployed: [11000, 11500, 11800, 11200, 11700, 11900],
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
    },
  },
  up_agra: {
    workAvailability: "Low",
    workAvailabilityColor: "red",
    paymentSpeed: "Bad",
    paymentSpeedColor: "red",
    peopleEmployed: "0.95 Lakh",
    stateComparison: "Worse",
    stateComparisonColor: "red",
    historicalEmployed: [9500, 9800, 9600, 10000, 9700, 9900],
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
    },
  },
};

// DOM element selections
const districtSelect = document.getElementById("district-select");
const loadingSpinner = document.getElementById("loading-spinner");
const errorMessage = document.getElementById("error-message");
const helpModal = document.getElementById("help-modal");
const helpButton = document.getElementById("help-button");
const closeModal = document.getElementById("close-modal");
const historicalChart = document.getElementById("historical-chart");
const metricCards = document.querySelectorAll(".grid.grid-cols-1 .bg-white");

// Function to render data for the selected district
function renderData(districtData) {
  // Update metric cards
  if (metricCards.length >= 4) {
    // Work Availability
    metricCards[0].querySelector("p.text-2xl").textContent =
      districtData.workAvailability;
    const workIndicator = metricCards[0].querySelector("span.rounded-full");
    workIndicator.className = `inline-block w-3 h-3 rounded-full bg-${districtData.workAvailabilityColor}-500 mr-2`;

    // Payment Speed
    metricCards[1].querySelector("p.text-2xl").textContent =
      districtData.paymentSpeed;
    const paymentIndicator = metricCards[1].querySelector("span.rounded-full");
    paymentIndicator.className = `inline-block w-3 h-3 rounded-full bg-${districtData.paymentSpeedColor}-500 mr-2`;

    // People Employed
    metricCards[2].querySelector("p.text-2xl").textContent =
      districtData.peopleEmployed;

    // State Comparison
    metricCards[3].querySelector("p.text-2xl").textContent =
      districtData.stateComparison;
    const comparisonIcon = metricCards[3].querySelector("i[data-lucide]");
    const comparisonSpan = metricCards[3].querySelector("span.text-sm");
    if (districtData.stateComparison === "Better") {
      comparisonIcon.setAttribute("data-lucide", "arrow-up");
    } else {
      comparisonIcon.setAttribute("data-lucide", "arrow-down");
    }
    comparisonIcon.className = `w-4 h-4 text-${districtData.stateComparisonColor}-500 mr-1`;
    comparisonSpan.textContent = districtData.stateComparison;
  }

  // Call renderChart function
  renderChart(districtData.historicalEmployed);

  // Populate help modal
  const helpContent = Object.entries(districtData.helpText)
    .map(
      ([key, value]) =>
        `<p><strong>${key
          .replace(/([A-Z])/g, " $1")
          .toLowerCase()}:</strong> ${value}</p>`
    )
    .join("");
  document.querySelector("#help-modal p.text-gray-700").innerHTML = helpContent;
}

// Async function to fetch district data
async function fetchDistrictData(districtId) {
  // Show loading spinner and hide main dashboard and error message
  loadingSpinner.classList.remove("hidden");
  const metricGrid = document.querySelector(
    ".grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4"
  );
  const chartDiv = document.querySelector("#historical-chart").parentElement;
  metricGrid.classList.add("hidden");
  chartDiv.classList.add("hidden");
  errorMessage.classList.add("hidden");

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Fetch data from mockDB
  const data = mockDB[`up_${districtId}`];
  if (data) {
    renderData(data);
    // Show main dashboard
    metricGrid.classList.remove("hidden");
    chartDiv.classList.remove("hidden");
  } else {
    // Show error message
    errorMessage.classList.remove("hidden");
  }

  // Hide loading spinner
  loadingSpinner.classList.add("hidden");
}

// Function to attempt automatic district detection using geolocation
function tryGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Simulate reverse geocoding: always resolve to "Lucknow" with ID "up_lucknow"
        const district = "Lucknow";
        const districtId = "lucknow"; // Adjusted to match dropdown values and fetchDistrictData expectation
        districtSelect.value = districtId;
        fetchDistrictData(districtId);
      },
      (error) => {
        // Do nothing on error or denial
      }
    );
  }
}

// Add event listener to district selection dropdown
districtSelect.addEventListener("change", () => {
  const selectedDistrict = districtSelect.value;
  fetchDistrictData(selectedDistrict);
});

// Call tryGeolocation when the script first loads
tryGeolocation();
