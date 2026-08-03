// Initialize Geoapify with your API Key
const geoapifyKey = "826933512ac54172a00e8d67e25e0421";

// 1. Setup Start Address Autocomplete
const startAutocomplete = new autocomplete.GeocoderAutocomplete(
    document.getElementById("start-autocomplete"), 
    geoapifyKey, 
    { placeholder: "e.g., Home, Railway Station..." }
);

// 2. Setup End Address Autocomplete
const endAutocomplete = new autocomplete.GeocoderAutocomplete(
    document.getElementById("end-autocomplete"), 
    geoapifyKey, 
    { placeholder: "e.g., Office, Kambala Park..." }
);

// Add the India filter to both dropdowns
startAutocomplete.addFilterByCountry(['in']);
endAutocomplete.addFilterByCountry(['in']);

// Variables to hold the exact coordinates chosen by the user
let startCoordinates = null;
let endCoordinates = null;

// Listen for the user selecting an address from the dropdown
startAutocomplete.on('select', (location) => {
    if (location) startCoordinates = location.geometry.coordinates; // [lng, lat]
});
endAutocomplete.on('select', (location) => {
    if (location) endCoordinates = location.geometry.coordinates;
});

// 3. Handle the Button Click
document.getElementById('calculate-btn').addEventListener('click', async () => {
    if (!startCoordinates || !endCoordinates) {
        alert("Please select both a valid start and end address from the dropdowns.");
        return;
    }

    const btn = document.getElementById('calculate-btn');
    btn.textContent = "Calculating...";
    
    try {
        // We will call your Cloudflare Worker here in the next step!
        // For now, we simulate success:
        console.log("Ready to send coordinates to worker:", startCoordinates, endCoordinates);
        alert("Frontend is wired up correctly! Check the console.");
        
    } catch (error) {
        console.error("Error:", error);
        alert("Something went wrong.");
    } finally {
        btn.textContent = "Calculate Commute";
    }
});
