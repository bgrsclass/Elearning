const express = require('express');
const Groq = require('groq-sdk');
const client = new Groq({ apiKey: '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' });

const app = express();
const port = 3001;

// Array to store responses
const searchHistory = [];

app.use(express.static('public'));

// Main route
app.get('/', async (req, res) => {
  const searchTerm = req.query.query || '';
  let formattedResponses = '';

  if (searchTerm.toLowerCase() === 'clear chat') {
    // Clear chat history if the search term is "clear chat"
    searchHistory.length = 0;
    formattedResponses = `
      <div class="response-container">
        <h2>Chat has been cleared.</h2>
      </div>
    `;
  } else if (searchTerm) {
    try {
      const chatCompletion = await client.chat.completions.create({
        "messages": [
          { "role": "system", "content": "You are a healthcare assistant. Only respond with healthcare-related information. If the query is unrelated to healthcare, indicate that the query is outside your scope." },
          { "role": "user", "content": searchTerm }
        ],
        "model": "llama3-70b-8192",
        "temperature": 1,
        "max_tokens": 1024,
        "top_p": 1,
        "stream": true,
        "stop": null
      });

      let responseText = '';
      for await (const chunk of chatCompletion) {
        responseText += chunk.choices[0]?.delta?.content || '';
      }

      responseText = responseText.replace(/\*\*/g, '').trim();

      // Check if the response is unrelated to healthcare
      if (!responseText.toLowerCase().includes("health") && !responseText.toLowerCase().includes("medical")) {
        responseText = "Error: This query is outside the scope of healthcare-related responses.";
      }

      // Save response to search history
      searchHistory.push({ term: searchTerm, response: responseText });
    } catch (error) {
      console.error(error);
      res.status(500).send("An error occurred while processing the request.");
      return;
    }
  } else {
    // Welcome message when no search term is provided
    formattedResponses = `
      <div class="response-container">
        <h2>Welcome to the Healthcare Chatbot</h2>
        <p>Type a healthcare-related query in the search box below and press Search to get started!</p>
      </div>
    `;
  }

  // Generate HTML for all saved responses if available
  if (searchHistory.length > 0) {
    formattedResponses += searchHistory.map((entry, index) => `
      <div class="response-container">
        <h2>Response ${index + 1}: ${entry.term}</h2>
        <ul>
          ${entry.response.split('\n').map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  res.send(`
    <html>
      <head>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(45deg, #ff6b6b, #f7b7a3);
            margin: 0;
            padding: 20px;
            color: green;
          }
          h1 {
            text-align: center;
            font-size: 30px;
            color: #fff;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
            margin-bottom: 30px;
          }
          .scroll-container {
            max-height: 500px;
            overflow-y: auto;
            background-color: rgba(255, 255, 255, 0.8);
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          }
          .response-container h2 {
            font-weight: bold;
            font-size: 20px;
            color: #333;
            margin-bottom: 15px;
            border-bottom: 2px solid #ff6b6b;
            padding-bottom: 5px;
          }
          ul {
            list-style-type: none;
            padding-left: 0;
            line-height: 1.6;
          }
          li {
            padding: 12px;
            background-color: transparent;
      
       
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          }
          .search-container {
            margin-top: 40px;
            text-align: center;
          }
          .search-container input[type="text"] {
            width: 75%;
            padding: 12px;
            font-size: 18px;
            border-radius: 30px;
            border: 2px solid #ff6b6b;
            background-color: #fff;
            color: #333;
            transition: all 0.3s;
          }
          .search-container input[type="text"]:focus {
            border-color: #3498db;
            outline: none;
            background-color:rgb(247, 194, 207);
          }
          .search-container button {
            padding: 12px 24px;
            font-size: 18px;
            color: #fff;
            background-color: #ff6b6b;
            border: none;
            border-radius: 30px;
            cursor: pointer;
            transition: all 0.3s;
            margin-left: 10px;
          }
          .search-container button:hover {
            background-color: #d9534f;
          }
        </style>
      </head>
      <body>
        <h1>Healthcare Chatbot</h1>
        
        <div class="scroll-container">
          ${formattedResponses}
        </div>
        <div class="search-container">
          <form action="/" method="get">
            <input type="text" name="query" placeholder="Ask a healthcare question...">
            <button type="submit">Search</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
