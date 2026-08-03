const geoapifyKey = "826933512ac54172a00e8d67e25e0421";
// Replace this with your actual Cloudflare Worker URL if it is different
const backendUrl = "https://clear-way.bhargavnandan007.workers.dev/api/calculate-commute";

const startAutocomplete = new autocomplete.GeocoderAutocomplete(
    document.getElementById("start-autocomplete"), 
    geoapifyKey, 
    { placeholder: "e.g., Home, Railway Station..." }
);
const endAutocomplete = new autocomplete.GeocoderAutocomplete(
    document.getElementById("end-autocomplete"), 
    geoapifyKey, 
    { placeholder: "e.g., Office, Kambala Park..." }
);

startAutocomplete.addFilterByCountry(['in']);
endAutocomplete.addFilterByCountry(['in']);

let startCoords = null;
let endCoords = null;

startAutocomplete.on('select', (location) => {
    if (location) startCoords = location.geometry.coordinates; // [lng, lat]
});
endAutocomplete.on('select', (location) => {
    if (location) endCoords = location.geometry.coordinates;
});

document.getElementById('calculate-btn').addEventListener('click', async () => {
    const startTimeInput = document.getElementById('start-time').value; // e.g., "12:00"
    const endTimeInput = document.getElementById('end-time').value;     // e.g., "16:00"

    if (!startCoords || !endCoords || !startTimeInput || !endTimeInput) {
        alert("Please select locations and specify a time window.");
        return;
    }

    const btn = document.getElementById('calculate-btn');
    const resultsContainer = document.getElementById('results-container');
    const timelineList = document.getElementById('timeline-list');
    
    btn.textContent = "Calculating...";
    timelineList.innerHTML = "";
    resultsContainer.classList.add('hidden');

    try {
        // Now sending coordinates AND time window to the backend
        const queryUrl = `/api/calculate-commute?start_lat=${startCoords[1]}&start_lng=${startCoords[0]}&end_lat=${endCoords[1]}&end_lng=${endCoords[0]}&start_time=${startTimeInput}&end_time=${endTimeInput}`;
        
        const response = await fetch(queryUrl);
        const data = await response.json();

        // ... (rest of the display logic remains the same)
        if (data.status === "Success" && data.route_data) {
            data.route_data.forEach(slot => {
                const li = document.createElement('li');
                if (slot.error) {
                    li.innerHTML = `<strong>${slot.time}</strong><span style="color: #ff6b6b;">${slot.error}</span>`;
                } else {
                    li.innerHTML = `
                        <strong>${slot.time}</strong> 
                        <span>⏳ ${slot.duration_minutes} mins (${slot.distance_km} km)</span>
                        <span>🌡️ ${slot.temp_celsius}°C | 🌧️ ${slot.rain_probability}%</span>
                    `;
                }
                timelineList.appendChild(li);
            });
            resultsContainer.classList.remove('hidden');
        } else {
            alert("Failed to fetch route data: " + (data.error || "Unknown error"));
        }

    } catch (error) {
        console.error("Error:", error);
        alert("Something went wrong connecting to the backend.");
    } finally {
        btn.textContent = "Calculate Commute";
    }
});
