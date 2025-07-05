const express = require('express');
const Groq = require('groq-sdk');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const csrf = require('csurf');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true
  }
}));

// Performance middleware
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// CORS configuration
app.use(cors({
  origin: isProduction ? ['https://yourdomain.com'] : ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(apiLimiter);

// Session configuration
const sessionConfig = {
  secret: SESSION_SECRET,
  name: 'medSessionId',
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({
    checkPeriod: 86400000,
    max: 1000
  }),
  cookie: { 
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 3600000
  },
  genid: () => uuidv4()
};

if (isProduction) {
  app.set('trust proxy', 1);
  sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// CSRF protection
const csrfProtection = csrf({ cookie: false });
app.use(csrfProtection);

// Initialize Groq client
const groqClient = new Groq({
  apiKey: GROQ_API_KEY,
  timeout: 10000
});

// Static files with cache control
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Doctor persona and specialties
const DOCTOR_PROFILES = {
  default: {
    id: 'default',
    name: "Dr. Smith",
    title: "MD",
    specialty: "General Practitioner",
    credentials: "Board Certified in Family Medicine",
    experience: "15 years",
    greeting: "Hello, I'm Dr. Smith. How can I assist you with your health concerns today?",
    avatar: "👨‍⚕️",
    bio: "Specializing in comprehensive care for patients of all ages with a focus on preventive medicine."
  },
  cardiologist: {
    id: 'cardiologist',
    name: "Dr. Johnson",
    title: "MD, FACC",
    specialty: "Cardiologist",
    credentials: "Board Certified in Cardiovascular Disease",
    experience: "18 years",
    greeting: "Hello, I'm Dr. Johnson, your cardiology specialist. What heart health questions do you have?",
    avatar: "👩‍⚕️",
    bio: "Expert in heart disease prevention, diagnosis, and treatment with extensive experience in cardiac care."
  },
  pediatrician: {
    id: 'pediatrician',
    name: "Dr. Lee",
    title: "MD, FAAP",
    specialty: "Pediatrician",
    credentials: "Board Certified in Pediatrics",
    experience: "12 years",
    greeting: "Hello, I'm Dr. Lee. How can I help with your child's health today?",
    avatar: "🧑‍⚕️",
    bio: "Dedicated to providing compassionate care for infants, children, and adolescents."
  },
  neurologist: {
    id: 'neurologist',
    name: "Dr. Garcia",
    title: "MD, PhD",
    specialty: "Neurologist",
    credentials: "Board Certified in Neurology",
    experience: "20 years",
    greeting: "Hello, I'm Dr. Garcia, specializing in neurological conditions. What symptoms are you experiencing?",
    avatar: "👨‍⚕️",
    bio: "Specialist in disorders of the nervous system with extensive research experience."
  }
};

// Medical disclaimer content
const MEDICAL_DISCLAIMER = `
  <strong>Important Disclaimer:</strong> This virtual consultation service provides general health information 
  and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice 
  of your physician or other qualified health provider with any questions you may have regarding a medical 
  condition. Never disregard professional medical advice or delay seeking it because of something you have 
  read in this consultation. In case of emergency, please call your local emergency number immediately.
`;

// Middleware to initialize and validate chat session
app.use((req, res, next) => {
  // Initialize session if doesn't exist
  if (!req.session.chatHistory) {
    req.session.chatHistory = [];
    req.session.doctorType = 'default';
    req.session.consultationStart = new Date();
    req.session.consultationId = uuidv4();
  }
  
  // Validate doctor type
  if (!DOCTOR_PROFILES[req.session.doctorType]) {
    req.session.doctorType = 'default';
  }
  
  // Trim chat history if too long
  if (req.session.chatHistory.length > 50) {
    req.session.chatHistory = req.session.chatHistory.slice(-50);
  }
  
  next();
});

// Input validation middleware
const validateInput = (req, res, next) => {
  const query = req.query.query;
  
  if (!query || typeof query !== 'string') {
    return next();
  }
  
  if (query.length > 500) {
    return res.status(400).json({ 
      error: 'Query exceeds maximum length of 500 characters.',
      code: 'INPUT_TOO_LONG'
    });
  }
  
  // Basic profanity filter
  const blockedTerms = ['fuck', 'shit', 'asshole', 'bitch', 'cunt'];
  const containsBlockedTerm = blockedTerms.some(term => 
    query.toLowerCase().includes(term)
  );
  
  if (containsBlockedTerm) {
    return res.status(400).json({ 
      error: 'Your message contains inappropriate language. Please rephrase.',
      code: 'INAPPROPRIATE_LANGUAGE'
    });
  }
  
  next();
};

// HTML sanitization with medical-specific rules
const sanitizeResponse = (html) => {
  return sanitizeHtml(html, {
    allowedTags: ['div', 'h2', 'h3', 'p', 'strong', 'em', 'br', 'span', 'ul', 'ol', 'li', 'hr', 'a'],
    allowedAttributes: {
      'div': ['class', 'id'],
      'h2': ['class'],
      'h3': ['class'],
      'p': ['class'],
      'span': ['class', 'style'],
      'ul': ['class'],
      'ol': ['class'],
      'li': ['class'],
      'a': ['href', 'target', 'rel']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      'a': (tagName, attribs) => {
        return {
          tagName: 'a',
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        };
      }
    }
  });
};

// Format chat messages consistently
const formatMessage = (sender, message, timestamp, meta = {}) => {
  const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isDoctor = meta.isDoctor || false;
  const isSystem = meta.isSystem || false;
  
  let messageClass = 'patient-message';
  if (isDoctor) messageClass = 'doctor-message';
  if (isSystem) messageClass = 'system-message';
  
  return `
    <div class="message ${messageClass}" data-timestamp="${timestamp.toISOString()}" data-sender="${sender}">
      <div class="message-header">
        <span class="sender">${sender}</span>
        <span class="time">${timeString}</span>
      </div>
      <div class="message-content">
        ${message}
      </div>
    </div>
  `;
};

// Generate doctor system prompt based on profile
const getSystemPrompt = (doctorProfile) => {
  return `
    You are ${doctorProfile.name}, ${doctorProfile.title}, a ${doctorProfile.specialty} with ${doctorProfile.experience} of experience.
    Your credentials: ${doctorProfile.credentials}.
    
    Role Guidelines:
    1. Respond as a professional doctor would to a patient - be empathetic, precise, and clear
    2. Use layman's terms for medical concepts when possible
    3. Ask relevant follow-up questions to clarify symptoms when needed
    4. If the query isn't medical, politely explain you can only discuss health matters
    5. For serious symptoms, recommend seeing a doctor in person immediately
    6. Always maintain patient confidentiality
    7. Provide evidence-based information
    8. When appropriate, suggest general lifestyle recommendations
    9. Never prescribe specific medications - only suggest discussing options with their doctor
    10. Include the following disclaimer when discussing treatments: 
        "This is general information only - please consult your doctor before making any changes"
    
    Current Date: ${new Date().toLocaleDateString()}
  `;
};

// Main consultation route
app.get('/', validateInput, csrfProtection, async (req, res) => {
  try {
    const searchTerm = (req.query.query || '').trim();
    const doctorProfile = DOCTOR_PROFILES[req.session.doctorType || 'default'];
    let formattedResponses = '';
    
    // Handle special commands
    if (searchTerm.toLowerCase() === 'clear chat') {
      req.session.chatHistory = [];
      req.session.doctorType = 'default';
      req.session.consultationStart = new Date();
      req.session.consultationId = uuidv4();
    } 
    else if (searchTerm.toLowerCase().startsWith('see ')) {
      // Change doctor specialty
      const specialty = searchTerm.toLowerCase().replace('see ', '').trim();
      if (DOCTOR_PROFILES[specialty]) {
        req.session.doctorType = specialty;
        req.session.chatHistory.push({
          sender: 'System',
          message: `You are now consulting with ${DOCTOR_PROFILES[specialty].name}, ${DOCTOR_PROFILES[specialty].specialty}.`,
          timestamp: new Date(),
          isSystem: true
        });
      }
    }
    else if (searchTerm) {
      // Process medical query
      const messages = [
        { 
          role: "system", 
          content: getSystemPrompt(doctorProfile)
        },
        ...req.session.chatHistory
          .filter(msg => !msg.isSystem)
          .map(msg => ({
            role: msg.sender === 'You' ? 'user' : 'assistant',
            content: msg.message
          })),
        { role: "user", content: searchTerm }
      ];
      
      // Add typing indicator to UI
      req.session.chatHistory.push({
        sender: 'You',
        message: searchTerm,
        timestamp: new Date()
      });
      
      // Get response from Groq API
      const chatCompletion = await groqClient.chat.completions.create({
        messages,
        model: "llama3-70b-8192",
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.2
      });
      
      const responseText = chatCompletion.choices[0]?.message?.content || '';
      
      // Save to session history
      req.session.chatHistory.push({
        sender: doctorProfile.name,
        message: responseText,
        timestamp: new Date(),
        isDoctor: true
      });
    }
    
    // Build chat history display
    if (req.session.chatHistory.length > 0) {
      formattedResponses = req.session.chatHistory.map(msg => {
        return formatMessage(
          msg.sender, 
          msg.message.replace(/\n/g, '<br>'), 
          new Date(msg.timestamp),
          {
            isDoctor: msg.isDoctor,
            isSystem: msg.isSystem
          }
        );
      }).join('');
    } else {
      // Initial greeting
      formattedResponses = formatMessage(
        doctorProfile.name,
        `${doctorProfile.greeting}<br><br>
        <strong>How to use this service:</strong><br>
        - Describe your symptoms or ask health questions<br>
        - For specialist advice, type 'see [specialty]' (e.g., 'see cardiologist')<br>
        - Type 'clear chat' to start a new consultation<br><br>
        <em>Please note:</em> This service does not replace in-person medical care.`,
        new Date(),
        { isDoctor: true }
      );
    }
    
    // Sanitize HTML output
    formattedResponses = sanitizeResponse(formattedResponses);
    
    // Calculate consultation duration
    const durationMs = new Date() - new Date(req.session.consultationStart);
    const durationMins = Math.floor(durationMs / 60000);
    
    // Send consultation page
    res.send(`
      <!DOCTYPE html>
      <html lang="en" data-theme="light">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="Virtual consultation with ${doctorProfile.name}, ${doctorProfile.specialty}">
        <title>Virtual Consultation with ${doctorProfile.name} | ${doctorProfile.specialty}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
        <style>
          :root {
            --primary-color: #1a5f7a;
            --primary-dark: #124963;
            --primary-light: #e3f4f4;
            --secondary-color: #57c5b6;
            --accent-color: #159895;
            --light-color: #f8f9fa;
            --dark-color: #343a40;
            --text-color: #2d3436;
            --text-light: #6c757d;
            --doctor-bg: #e3f4f4;
            --patient-bg: #f1f7f7;
            --system-color: #6c757d;
            --error-color: #dc3545;
            --success-color: #28a745;
            --warning-color: #ffc107;
            --border-radius: 10px;
            --box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
            --transition: all 0.3s ease;
            --header-height: 80px;
          }
          
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          
          body {
            font-family: 'Roboto', sans-serif;
            line-height: 1.6;
            color: var(--text-color);
            background-color: #f5f7fa;
            padding: 0;
            margin: 0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
            height: calc(100vh - var(--header-height));
            display: flex;
            flex-direction: column;
          }
          
          .header {
            background-color: white;
            padding: 15px 0;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            position: sticky;
            top: 0;
            z-index: 100;
            height: var(--header-height);
          }
          
          .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
          }
          
          .doctor-info {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          
          .doctor-avatar {
            font-size: 2rem;
            background-color: var(--primary-light);
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--primary-color);
            flex-shrink: 0;
          }
          
          .doctor-details h1 {
            font-family: 'Playfair Display', serif;
            font-size: 1.3rem;
            color: var(--primary-color);
            margin-bottom: 3px;
          }
          
          .doctor-details p {
            font-size: 0.9rem;
            color: var(--text-light);
          }
          
          .consultation-info {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 5px;
          }
          
          .consultation-id {
            font-size: 0.75rem;
            color: var(--text-light);
          }
          
          .consultation-time {
            font-size: 0.9rem;
            color: var(--text-light);
            background-color: var(--light-color);
            padding: 5px 10px;
            border-radius: var(--border-radius);
            white-space: nowrap;
          }
          
          .chat-container {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            padding: 20px 0;
            overflow: hidden;
          }
          
          .chat-history {
            flex-grow: 1;
            overflow-y: auto;
            padding: 15px;
            background-color: white;
            border-radius: var(--border-radius);
            margin-bottom: 15px;
            box-shadow: var(--box-shadow);
            display: flex;
            flex-direction: column;
            gap: 15px;
            scroll-behavior: smooth;
          }
          
          .message {
            max-width: 80%;
            padding: 12px 15px;
            border-radius: var(--border-radius);
            position: relative;
            animation: fadeIn 0.3s ease;
            word-wrap: break-word;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .message-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 0.85rem;
          }
          
          .sender {
            font-weight: 600;
          }
          
          .time {
            color: var(--text-light);
            font-size: 0.8rem;
          }
          
          .message-content {
            line-height: 1.5;
          }
          
          .message-content a {
            color: var(--primary-color);
            text-decoration: underline;
          }
          
          .message-content a:hover {
            color: var(--primary-dark);
          }
          
          .doctor-message {
            align-self: flex-start;
            background-color: var(--doctor-bg);
            border-top-left-radius: 5px;
            border: 1px solid #d1e7e7;
          }
          
          .patient-message {
            align-self: flex-end;
            background-color: var(--patient-bg);
            border-top-right-radius: 5px;
            border: 1px solid #d1e7e7;
          }
          
          .system-message {
            align-self: center;
            text-align: center;
            margin: 10px 0;
            max-width: 90%;
          }
          
          .system-message .message-content {
            font-size: 0.85rem;
            color: var(--system-color);
            background-color: #f8f9fa;
            padding: 5px 10px;
            border-radius: var(--border-radius);
          }
          
          .input-container {
            padding: 15px 0;
            background-color: white;
            border-top: 1px solid #eee;
            position: sticky;
            bottom: 0;
          }
          
          .input-form {
            display: flex;
            gap: 10px;
          }
          
          .input-field {
            flex-grow: 1;
            padding: 12px 15px;
            border: 1px solid #ddd;
            border-radius: var(--border-radius);
            font-size: 1rem;
            transition: var(--transition);
            font-family: 'Roboto', sans-serif;
          }
          
          .input-field:focus {
            outline: none;
            border-color: var(--secondary-color);
            box-shadow: 0 0 0 2px rgba(87, 197, 182, 0.2);
          }
          
          .submit-button {
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: var(--border-radius);
            padding: 0 25px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: var(--transition);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .submit-button:hover {
            background-color: var(--primary-dark);
          }
          
          .disclaimer {
            font-size: 0.8rem;
            color: var(--text-light);
            text-align: center;
            margin-top: 15px;
            padding: 10px;
            background-color: #f8f9fa;
            border-radius: var(--border-radius);
          }
          
          .typing-indicator {
            display: none;
            align-self: flex-start;
            background-color: var(--doctor-bg);
            padding: 10px 15px;
            border-radius: var(--border-radius);
            margin-bottom: 15px;
          }
          
          .typing-dots {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--text-light);
            margin-right: 4px;
            animation: typingAnimation 1.4s infinite ease-in-out;
          }
          
          .typing-dots:nth-child(1) {
            animation-delay: 0s;
          }
          
          .typing-dots:nth-child(2) {
            animation-delay: 0.2s;
          }
          
          .typing-dots:nth-child(3) {
            animation-delay: 0.4s;
            margin-right: 0;
          }
          
          @keyframes typingAnimation {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-5px); }
          }
          
          @media (max-width: 768px) {
            :root {
              --header-height: 100px;
            }
            
            .container {
              padding: 0 10px;
            }
            
            .header-content {
              flex-direction: column;
              align-items: flex-start;
              gap: 10px;
              padding: 10px;
            }
            
            .consultation-info {
              align-items: flex-start;
              width: 100%;
              flex-direction: row;
              justify-content: space-between;
            }
            
            .message {
              max-width: 90%;
            }
            
            .input-form {
              flex-direction: column;
            }
            
            .submit-button {
              padding: 12px;
            }
          }
          
          @media (max-width: 480px) {
            .doctor-details h1 {
              font-size: 1.1rem;
            }
            
            .doctor-details p {
              font-size: 0.8rem;
            }
            
            .consultation-time {
              font-size: 0.8rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <div class="doctor-info">
              <div class="doctor-avatar">${doctorProfile.avatar}</div>
              <div class="doctor-details">
                <h1>${doctorProfile.name}, ${doctorProfile.title}</h1>
                <p>${doctorProfile.specialty}</p>
              </div>
            </div>
            <div class="consultation-info">
              <span class="consultation-id">ID: ${req.session.consultationId}</span>
              <span class="consultation-time">
                Duration: ${durationMins} min | Started: ${new Date(req.session.consultationStart).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
        
        <div class="container">
          <div class="chat-container">
            <div class="chat-history" id="chatHistory">
              ${formattedResponses}
              <div class="typing-indicator" id="typingIndicator">
                <span class="typing-dots"></span>
                <span class="typing-dots"></span>
                <span class="typing-dots"></span>
              </div>
            </div>
            
            <div class="input-container">
              <form class="input-form" action="/" method="get" id="consultationForm">
                <input 
                  type="text" 
                  name="query" 
                  class="input-field" 
                  placeholder="Describe your symptoms or ask a health question..." 
                  value="${searchTerm ? sanitizeHtml(searchTerm.replace(/"/g, '&quot;')) : ''}"
                  aria-label="Health question input"
                  required
                  autocomplete="off"
                >
                <input type="hidden" name="_csrf" value="${req.csrfToken()}">
                <button type="submit" class="submit-button">Send</button>
              </form>
              
              <div class="disclaimer">
                ${MEDICAL_DISCLAIMER}
              </div>
            </div>
          </div>
        </div>
        
        <script>
          // Auto-scroll to bottom of chat and focus input
          window.onload = function() {
            const chatHistory = document.getElementById('chatHistory');
            chatHistory.scrollTop = chatHistory.scrollHeight;
            document.querySelector('.input-field').focus();
            
            // Show typing indicator if waiting for response
            ${searchTerm && !req.query.responseReceived ? 'document.getElementById("typingIndicator").style.display = "flex";' : ''}
          };
          
          // Handle form submission
          const form = document.getElementById('consultationForm');
          form.addEventListener('submit', function(e) {
            const input = document.querySelector('.input-field');
            if (input.value.trim() === '') {
              e.preventDefault();
              return;
            }
            
            // Show typing indicator
            document.getElementById('typingIndicator').style.display = 'flex';
            chatHistory.scrollTop = chatHistory.scrollHeight;
          });
          
          // Handle Enter key for submission
          document.querySelector('.input-field').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              form.submit();
            }
          });
          
          // Keep scroll at bottom when new messages arrive
          const observer = new MutationObserver(function() {
            chatHistory.scrollTop = chatHistory.scrollHeight;
          });
          
          observer.observe(chatHistory, {
            childList: true,
            subtree: true
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Consultation error:', error);
    res.status(500).send(`
      <div class="error-message" style="padding: 20px; max-width: 800px; margin: 50px auto; background: white; border-radius: var(--border-radius); box-shadow: var(--box-shadow);">
        <h3 style="color: var(--error-color); margin-bottom: 15px;">Consultation Service Temporarily Unavailable</h3>
        <p style="margin-bottom: 10px;">We're experiencing high demand for our medical consultation service. Please try again shortly.</p>
        <p style="margin-bottom: 15px;">For urgent medical concerns, please contact your local healthcare provider or emergency services immediately.</p>
        <a href="/" style="color: var(--primary-color); text-decoration: underline;">Return to consultation</a>
      </div>
    `);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ 
      error: 'Invalid CSRF token',
      code: 'CSRF_ERROR'
    });
  }
  
  res.status(500).send(`
    <div class="error-message" style="padding: 20px; max-width: 800px; margin: 50px auto; background: white; border-radius: var(--border-radius); box-shadow: var(--box-shadow);">
      <h3 style="color: var(--error-color); margin-bottom: 15px;">Unexpected Consultation Error</h3>
      <p style="margin-bottom: 10px;">We've encountered an unexpected error in your consultation. Our technical team has been notified.</p>
      <p style="margin-bottom: 15px;">Please refresh the page to continue your consultation or try again later.</p>
      <a href="/" style="color: var(--primary-color); text-decoration: underline;">Return to consultation</a>
    </div>
  `);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <div class="error-message" style="padding: 20px; max-width: 800px; margin: 50px auto; background: white; border-radius: var(--border-radius); box-shadow: var(--box-shadow);">
      <h3 style="color: var(--error-color); margin-bottom: 15px;">Page Not Found</h3>
      <p style="margin-bottom: 15px;">The requested consultation page could not be found.</p>
      <a href="/" style="color: var(--primary-color); text-decoration: underline;">Return to consultation</a>
    </div>
  `);
});

// Start server
app.listen(port, () => {
  console.log(`Doctor consultation service running at http://localhost:${port}`);
  console.log(`Environment: ${isProduction ? 'Production' : 'Development'}`);
  console.log(`Session secret: ${SESSION_SECRET.substring(0, 4)}...`);
});
