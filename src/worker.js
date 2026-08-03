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
      const startLat = url.searchParams.get("start_lat");
      const startLng = url.searchParams.get("start_lng");
      const endLat = url.searchParams.get("end_lat");
      const endLng = url.searchParams.get("end_lng");
      const startTimeStr = url.searchParams.get("start_time");
      const endTimeStr = url.searchParams.get("end_time");

      if (!startLat || !startLng || !endLat || !endLng || !startTimeStr || !endTimeStr) {
         return new Response(JSON.stringify({ error: "Missing required parameters." }), {
           status: 400,
           headers: { ...corsHeaders, "Content-Type": "application/json" }
         });
      }

      // === MAPPLS OAUTH CREDENTIALS ===
      const mapplsClientId = "YOUR_CLIENT_ID"; 
      const mapplsClientSecret = "YOUR_CLIENT_SECRET"; 

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
         const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${startLat}&longitude=${startLng}&hourly=temperature_2m,precipitation_probability&timezone=Asia%2FKolkata`;
         const weatherRes = await fetch(weatherUrl);
         const weatherData = await weatherRes.json();

         // --- STEP 3: Setup 30-Minute Time Loop ---
         const results = [];
         const coordString = `${startLng},${startLat};${endLng},${endLat}`;
         
         const now = new Date();
         const istOffset = 5.5 * 60 * 60 * 1000;
         let currentIst = new Date(now.getTime() + istOffset);
         
         let [startHr, startMin] = startTimeStr.split(':').map(Number);
         const [endHr, endMin] = endTimeStr.split(':').map(Number);

         let targetDay = new Date(currentIst);
         
         // If requested time is earlier than current IST time, treat it as tomorrow
         if (startHr < currentIst.getUTCHours() || (startHr === currentIst.getUTCHours() && startMin < currentIst.getUTCMinutes())) {
             targetDay.setDate(targetDay.getDate() + 1); 
         }
         
         while (startHr < endHr || (startHr === endHr && startMin <= endMin)) {
             
             if (startHr >= 24) {
                 startHr = 0;
                 targetDay.setDate(targetDay.getDate() + 1);
             }

             const dateISO = targetDay.toISOString().split('T')[0];
             const hourStr = startHr.toString().padStart(2, '0');
             const minStr = startMin.toString().padStart(2, '0');
             
             const timeString = `${dateISO}T${hourStr}:${minStr}:00+05:30`;
             const unixDepartureTime = Math.floor(new Date(timeString).getTime() / 1000);

             // A. Predictive Traffic Routing
             let mapplsRouteUrl = `https://apis.mappls.com/advancedmaps/v1/${mapplsAccessToken}/route_adv/driving/${coordString}?rtype=1&region=ind&departure_time=${unixDepartureTime}`;
             let mapplsRes = await fetch(mapplsRouteUrl);
             let mapplsData = await mapplsRes.json();

             // B. Fallback for Long Distance Trips
             let isFallback = false;
             if (!mapplsData.routes || mapplsData.routes.length === 0) {
                 mapplsRouteUrl = `https://apis.mappls.com/advancedmaps/v1/${mapplsAccessToken}/route_adv/driving/${coordString}?region=ind`;
                 mapplsRes = await fetch(mapplsRouteUrl);
                 mapplsData = await mapplsRes.json();
                 isFallback = true;
             }

             // C. Weather Calculation
             const targetWeatherTime = `${dateISO}T${hourStr}:00`;
             const weatherIndex = weatherData.hourly?.time?.indexOf(targetWeatherTime) ?? -1;

             let tempC = "N/A";
             let rainChance = 0;

             if (weatherIndex !== -1) {
               tempC = weatherData.hourly.temperature_2m[weatherIndex];
               rainChance = weatherData.hourly.precipitation_probability[weatherIndex];
             }

             const ampm = startHr >= 12 ? 'PM' : 'AM';
             const displayHour = startHr % 12 || 12;

             if (mapplsData.routes && mapplsData.routes.length > 0) {
                 const durationSeconds = mapplsData.routes[0].duration;
                 results.push({
                     time: `${displayHour}:${minStr} ${ampm}`,
                     duration_minutes: Math.round(durationSeconds / 60),
                     distance_km: (mapplsData.routes[0].distance / 1000).toFixed(2),
                     temp_celsius: tempC,
                     rain_probability: rainChance,
                     note: isFallback ? " (No live traffic data)" : ""
                 });
             } else {
                 results.push({
                     time: `${displayHour}:${minStr} ${ampm}`,
                     error: mapplsData.error || "Invalid route."
                 });
             }

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
