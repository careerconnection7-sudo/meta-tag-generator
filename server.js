import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many requests. Try again in 15 minutes.' }
});

app.use('/api/', limiter);

// Generate meta tags
async function generateMetaTags(input) {
    try {
        console.log('🔑 Using API Key:', process.env.OPENAI_API_KEY?.substring(0, 20) + '...');
        
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not found in environment variables');
        }

        const requestData = {
            model: 'gpt-3.5-turbo',  // Changed to more reliable model
            messages: [{
                role: 'system',
                content: 'You are an SEO expert. Generate compelling meta tags following best practices. Always respond with valid JSON only.'
            }, {
                role: 'user',
                content: `Generate SEO-optimized meta tags for:

Content: ${input.content}
${input.keywords ? `Keywords: ${input.keywords}` : ''}
${input.url ? `URL: ${input.url}` : ''}

Return ONLY this JSON format (no markdown, no extra text):
{
  "metaTitle": "50-60 char title with main keyword",
  "metaDescription": "150-160 char description with CTA",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "ogTitle": "engaging social media title",
  "ogDescription": "compelling social description",
  "twitterTitle": "twitter optimized title",
  "twitterDescription": "twitter card description"
}`
            }],
            temperature: 0.7,
            max_tokens: 1000
        };

        console.log('📤 Sending request to OpenAI...');

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            requestData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        );

        console.log('📥 Received response from OpenAI');

        const content = response.data.choices[0].message.content;
        console.log('📝 Response content:', content.substring(0, 100) + '...');
        
        // Try to extract JSON from response
        let jsonData;
        
        // Remove markdown code blocks if present
        let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // Try to find JSON object
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            jsonData = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('No valid JSON found in response');
        }

        // Validate required fields
        if (!jsonData.metaTitle || !jsonData.metaDescription || !jsonData.keywords) {
            throw new Error('Response missing required fields');
        }

        console.log('✅ Successfully parsed meta tags');
        return jsonData;
        
    } catch (error) {
        console.error('❌ OpenAI Error Details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        // Provide specific error messages
        if (error.response?.status === 401) {
            throw new Error('Invalid OpenAI API key. Please check your key.');
        } else if (error.response?.status === 429) {
            throw new Error('OpenAI rate limit exceeded. Please try again later.');
        } else if (error.response?.status === insufficient_quota) {
            throw new Error('OpenAI account has no credits. Please add payment method.');
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout. Please try again.');
        } else {
            throw new Error(error.message || 'Failed to generate meta tags');
        }
    }
}

// API endpoint
app.post('/api/generate', async (req, res) => {
    try {
        const { content, keywords, url } = req.body;
        
        console.log('🎯 New generation request received');
        
        if (!content || content.trim().length < 20) {
            return res.status(400).json({ 
                error: 'Please provide at least 20 characters of content' 
            });
        }

        const metaTags = await generateMetaTags({ content, keywords, url });
        
        const htmlCode = `<!-- Essential META Tags -->
<title>${metaTags.metaTitle}</title>
<meta name="description" content="${metaTags.metaDescription}">
<meta name="keywords" content="${metaTags.keywords.join(', ')}">

<!-- Open Graph Meta Tags -->
<meta property="og:title" content="${metaTags.ogTitle}">
<meta property="og:description" content="${metaTags.ogDescription}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url || 'https://yourwebsite.com'}">
<meta property="og:image" content="https://yourwebsite.com/image.jpg">

<!-- Twitter Card Meta Tags -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${metaTags.twitterTitle}">
<meta name="twitter:description" content="${metaTags.twitterDescription}">
<meta name="twitter:image" content="https://yourwebsite.com/image.jpg">`;

        res.json({
            success: true,
            metaTags,
            htmlCode,
            stats: {
                titleLength: metaTags.metaTitle.length,
                descriptionLength: metaTags.metaDescription.length,
                keywordCount: metaTags.keywords.length
            }
        });
        
        console.log('✅ Response sent successfully');
        
    } catch (error) {
        console.error('❌ Generation Error:', error.message);
        res.status(500).json({ 
            error: error.message || 'Failed to generate meta tags. Please try again.' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    res.json({ 
        status: 'ok',
        openai_configured: hasApiKey,
        api_key_preview: hasApiKey ? process.env.OPENAI_API_KEY.substring(0, 10) + '...' : 'NOT SET'
    });
});

// Test endpoint
app.get('/api/test', async (req, res) => {
    try {
        const testResult = await generateMetaTags({
            content: 'This is a test page about web development and coding tutorials',
            keywords: 'web development, coding',
            url: 'https://example.com'
        });
        res.json({ success: true, result: testResult });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('\n=================================');
    console.log('🚀 META TAG GENERATOR SERVER');
    console.log('=================================');
    console.log(`✅ Status: RUNNING`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔑 OpenAI: ${process.env.OPENAI_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🧪 Health: http://localhost:${PORT}/api/health`);
    console.log('=================================\n');
    console.log('Press Ctrl+C to stop\n');
});
