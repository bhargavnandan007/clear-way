export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);

    if (url.pathname === "/api/calculate-commute") {
      // Expecting latitude and longitude passed directly from frontend autocomplete!
      const startLat = url.searchParams.get("start_lat");
      const startLng = url.searchParams.get("start_lng");
      const endLat = url.searchParams.get("end_lat");
      const endLng = url.searchParams.get("end_lng");

      if (!startLat || !startLng || !endLat || !endLng) {
         return new Response(JSON.stringify({ error: "Missing start or end coordinates." }), { 
           status: 400, 
           headers: { ...corsHeaders, "Content-Type": "application/json" } 
         });
      }

      // === MAPPLS OAUTH CREDENTIALS ===
      const mapplsClientId = "96dHZVzsAusy9WUZvw8DmOqLlfd2mazlVJeN_Xn7_DTompZaxCnM_W-qFtdzu-VeLLLTo-pcSJbF47wQCivhvA=="; 
      const mapplsClientSecret = "lrFxI-iSEg-jDRqME4PigRY7X9N3n8VI4k1SDpfEw6wAxpFhOz28TAPNbKHKYQSFGiOHrZj1B-zNVsGMoLM9SC6M-uqrqvlK"; 

      try {
         // --- STEP 1: Fetch Mappls OAuth Token ---
         const tokenUrl = "https://outpost.mappls.com/api/security/oauth/token";
         const tokenData = new URLSearchParams({
           grant_type: "client_credentials",
           client_id: mapplsClientId,
           client_secret: mapplsClientSecret
         });

         const tokenResponse = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: tokenData.toString()
         });

         const tokenJson = await tokenResponse.json();
         const mapplsAccessToken = tokenJson.access_token;
         if (!mapplsAccessToken) throw new Error("Mappls authentication failed.");

         // --- STEP 2: Fetch Open-Meteo Weather Data ---
         // Using Asia/Kolkata timezone to align hourly slots with IST
         const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${startLat}&longitude=${startLng}&hourly=temperature_2m,precipitation_probability&timezone=Asia%2FKolkata`;
         const weatherRes = await fetch(weatherUrl);
         const weatherData = await weatherRes.json();

         // --- STEP 3: Setup 30-Minute Time Loop ---
         const results = [];
         const coordString = `${startLng},${startLat};${endLng},${endLat}`;
         
         // Extract user time inputs (e.g., "12:00", "16:00")
         const startTimeStr = url.searchParams.get("start_time"); // format HH:MM
         const endTimeStr = url.searchParams.get("end_time");     // format HH:MM

         if (!startTimeStr || !endTimeStr) {
             throw new Error("Missing start or end time parameters.");
         }

         // Calculate the target day (Tomorrow)
         const now = new Date();
         const istOffset = 5.5 * 60 * 60 * 1000;
         let targetDay = new Date(now.getTime() + istOffset);
         targetDay.setDate(targetDay.getDate() + 1); // Set to tomorrow to guarantee future predictions
         const dateISO = targetDay.toISOString().split('T')[0];

         // Parse start and end hours/minutes
         let [startHr, startMin] = startTimeStr.split(':').map(Number);
         const [endHr, endMin] = endTimeStr.split(':').map(Number);

         // Loop in 30-minute increments
         while (startHr < endHr || (startHr === endHr && startMin <= endMin)) {
             
             const hourStr = startHr.toString().padStart(2, '0');
             const minStr = startMin.toString().padStart(2, '0');
             
             const timeString = `${dateISO}T${hourStr}:${minStr}:00+05:30`;
             const unixDepartureTime = Math.floor(new Date(timeString).getTime() / 1000);

             // A. Call Mappls
             const mapplsRouteUrl = `https://apis.mappls.com/advancedmaps/v1/${mapplsAccessToken}/route_adv/driving/${coordString}?rtype=1&region=ind&departure_time=${unixDepartureTime}`;
             const mapplsRes = await fetch(mapplsRouteUrl);
             const mapplsData = await mapplsRes.json();

             // B. Extract Weather (Weather API is hourly, so snap to nearest hour)
             const targetWeatherTime = `${dateISO}T${hourStr}:00`;
             const weatherIndex = weatherData.hourly?.time?.indexOf(targetWeatherTime) ?? -1;

             let tempC = "N/A";
             let rainChance = 0;

             if (weatherIndex !== -1) {
               tempC = weatherData.hourly.temperature_2m[weatherIndex];
               rainChance = weatherData.hourly.precipitation_probability[weatherIndex];
             }

             // Display Time Formatting
             const ampm = startHr >= 12 ? 'PM' : 'AM';
             const displayHour = startHr % 12 || 12;

             // C. Store Data
             if (mapplsData.routes && mapplsData.routes.length > 0) {
                 const durationSeconds = mapplsData.routes[0].duration;
                 results.push({
                     time: `${displayHour}:${minStr} ${ampm}`,
                     duration_minutes: Math.round(durationSeconds / 60),
                     distance_km: (mapplsData.routes[0].distance / 1000).toFixed(2),
                     temp_celsius: tempC,
                     rain_probability: rainChance
                 });
             } else {
                 results.push({
                     time: `${displayHour}:${minStr} ${ampm}`,
                     error: "Past time or invalid route."
                 });
             }

             // Increment by 30 minutes
             startMin += 30;
             if (startMin >= 60) {
                 startMin = 0;
                 startHr += 1;
             }
         }

         return new Response(JSON.stringify({
            status: "Success",
            route_data: results
         }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
         });

      } catch (error) {
         return new Response(JSON.stringify({ error: "Failed to calculate commute.", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response("Clearway Backend is Live!", { headers: corsHeaders });
  },
};
