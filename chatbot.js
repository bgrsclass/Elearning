// Import required modules
const express = require('express');
const Groq = require('groq-sdk');
const client = new Groq({ apiKey: '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' });
const path = require('path');

const app = express();
const port = 3000;

// Array to store responses
const searchHistory = [];

// Common programming languages or coding-related terms
const codingKeywords = ['javascript', 'python', 'c++', 'java', 'html', 'css', 'ruby', 'php', 'typescript', 'sql'];

app.use(express.static('public'));

// Function to format response into steps
function formatResponseSteps(responseText, isCodingQuery) {
  if (isCodingQuery) {
    responseText = responseText.replace(/[\\*\\/\\+\\-\\=\\^\\(\\)\\{\\}]/g, '');
  }

  const steps = responseText.split('\n').map((line) => {
    return `<div class="step">
      <p>${line.trim()}</p>
    </div>`;
  }).join('');

  return steps;
}

// Main route
app.get('/', async (req, res) => {
  const searchTerm = req.query.query || '';
  let formattedResponses = '';
  const isCodingQuery = codingKeywords.some(keyword => searchTerm.toLowerCase().includes(keyword));

  if (searchTerm.toLowerCase() === 'clear chat') {
    searchHistory.length = 0;
    formattedResponses = `  
      <div class="response-container">
        <h2>The chat history has been cleared.</h2>
      </div>
    `;
  } else if (searchTerm) {
    try {
      const chatCompletion = await client.chat.completions.create({
        "messages": [{ "role": "user", "content": searchTerm }],
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

      const formattedSteps = formatResponseSteps(responseText, isCodingQuery);

      searchHistory.push({ term: searchTerm, response: formattedSteps });
    } catch (error) {
      console.error(error);
      res.status(500).send("An error occurred.");
      return;
    }
  }

  formattedResponses = searchHistory.map(
    (item) => `  
      <div class="message-container">
        <div class="user-message">
          <span class="highlight">Question:</span> ${item.term}
        </div>
        <div class="bot-message">
          <span class="highlight">Answer:</span> ${item.response}
        </div>
      </div>
    `).join('');

  if (searchHistory.length === 0 && !searchTerm) {
    formattedResponses = `  
      <div class="response-container">
        <h2>Welcome to the Teacher's Chatbot</h2>
        <p>Ask your questions below, and I will assist you with clear and structured answers!</p>
      </div>
    `;
  }
  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script type="text/javascript" async
          src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js?config=TeX-MML-AM_CHTML">
        </script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">  <!-- Font Awesome CDN -->
        <style>
          /* Styling for the steps */
          .step {
            margin-bottom: 15px;
          }
          .step p {
            font-size: 18px;
            color: #333;
          }
          /* Message styling */
          .message-container .user-message,
          .message-container .bot-message {
            padding: 15px 20px;
            border-radius: 20px;
            max-width: 80%;
            word-wrap: break-word;
            font-size: 18px;
            color: #fff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow-wrap: break-word;
            word-break: break-word;
          }
          .message-container {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
          }
          .user-message {
            background-color: #3498db;
            align-self: flex-start;
          }
          .bot-message {
            background-color: rgb(234, 214, 31);
            align-self: flex-end;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            background-color: #f4f7fa;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .chat-container {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
            overflow: hidden;
            transition: transform 0.3s ease;
          }
          .header {
            background: linear-gradient(135deg, #2c3e50, #3498db);
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 26px;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
          }
          .main-content {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          .scroll-container {
            max-height: calc(100vh - 220px);
            overflow-y: auto;
            padding: 25px;
            flex-grow: 1;
            background-color: #f5f5f5;
            border-top: 2px solid #3498db;
          }
          .search-container {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            padding: 20px;
            background-color: #ffffff;
            border-top: 1px solid #ddd;
            border-bottom-left-radius: 12px;
            border-bottom-right-radius: 12px;
          }
            .search-container form {
  display: flex;
  align-items: center;
  gap: 10px; /* Adjust gap for consistent spacing */
}
          .search-container input[type="text"] {
            width: 70%;
            padding: 15px 20px;
            font-size: 18px;
            border-radius: 20px;
            border: 1px solid #ccd1d9;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          }
          .search-container input[type="text"]:focus {
            border-color: #3498db;
            outline: none;
          }
          .search-container button {
            padding: 15px 20px;
            font-size: 18px;
            color: white;
            background-color: #3498db;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
          }
          .search-container button:hover {
            background-color: #2980b9;
            transform: scale(1.05);
          }
          /* Microphone button styling */
         



.microphone-button {
  margin-left: 10px; /* Adds space between the search bar and the microphone */
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 50%;
  padding: 10px;
  cursor: pointer;
  transition: transform 0.2s, background-color 0.3s ease;
}

.microphone-button:hover {
  background-color: #2980b9;
  transform: scale(1.1);
}

.microphone-button i {
  font-size: 16px; /* Adjust icon size */
}
   }
.microphone-button i,
  .file-upload-label i {
    font-size: 22px; /* Increase icon size */
  }
            .microphone-button:hover {
    background-color: #2980b9;
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }


          .scroll-container::-webkit-scrollbar {
            width: 8px;
          }

          .scroll-container::-webkit-scrollbar-thumb {
            background: #3498db;
            border-radius: 10px;
          }

          .scroll-container::-webkit-scrollbar-thumb:hover {
            background: #2980b9;
          }

          @media (max-width: 768px) {
            .header {
              font-size: 20px;
              padding: 15px;
            }
.search-container {
  position: relative; /* Make this container the reference for positioning */
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 20px;
  background-color: #ffffff;
  border-top: 1px solid #ddd;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}
            .search-container input[type="text"] {
    width: 50%;
    padding: 15px 20px;
    font-size: 18px;
    border-radius: 20px;
    border: 1px solid #ccd1d9;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
      .search-container input[type="text"]:focus {
    border-color: #3498db;
    outline: none;
  }
             .search-container button {
    padding: 15px 20px;
    font-size: 18px;
    color: white;
    background-color: #3498db;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    transition: background-color 0.3s ease, transform 0.2s ease;
  }
  .search-container button:hover {
    background-color: #2980b9;
    transform: scale(1.05);
  }
    @media (max-width: 768px) {
    .microphone-button,
    .file-upload-label {
      padding: 10px 15px;
      font-size: 16px;
    }

    .search-container input[type="text"] {
      width: 70%;
      font-size: 16px;
    }

    .search-container button {
      font-size: 16px;
      padding: 12px 18px;
    }
          }
        </style>
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            const searchInput = document.querySelector('input[name="query"]');
            
            // Speech Recognition Setup
            recognition.continuous = false;
            recognition.lang = 'en-US';
            
            recognition.onresult = (event) => {
              const speechResult = event.results[0][0].transcript.toLowerCase();
              if (speechResult.includes('hey boy')) {
                searchInput.focus();
              } else {
                searchInput.value = speechResult;
                const searchForm = document.querySelector('.search-container form');
                if (searchForm) {
                  searchForm.submit();
                }
              }
            };

            // Listen for keypress to start speech recognition
            document.addEventListener('keydown', (e) => {
              if (e.key === 'v') {
                recognition.start();
              }
            });

            // Microphone for voice input
            const microphoneButton = document.createElement('button');
            microphoneButton.classList.add('microphone-button'); // Add this class for styling
            microphoneButton.innerHTML = '<i class="fas fa-microphone"></i>'; // Font Awesome microphone icon
            document.querySelector('.search-container').appendChild(microphoneButton);
            
            microphoneButton.addEventListener('click', () => {
              recognition.start();
            });
          });
        </script>
      </head>
      <body>
        <div class="chat-container">
          <div class="header">
            Teacher's Chatbot
          </div>
          <div class="main-content">
            <div class="scroll-container">
              ${formattedResponses}
            </div>
            <div class="search-container">
              <form action="/" method="get">
                <input type="text" name="query" placeholder="Ask a question..." />
                <button type="submit">Search</button>
            
              </form>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
