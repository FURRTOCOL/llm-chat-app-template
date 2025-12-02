/**
 * Cloudflare Workers — Multi-language LLM Chat API with Web Scraping
 * With streaming status updates
 */

import { Env, ChatMessage } from "./types";

// === 모델 ID들 ===
const MODEL_DEFAULT = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_GPT20B = "@cf/openai/gpt-oss-20b";
const MODEL_LLM3_2_3B = "@cf/meta/llama-3.2-3b-instruct";

// === 다국어 시스템 프롬프트 ===
const SYSTEM_PROMPTS = {
  ko: `당신은 웹 검색 및 데이터 수집 기능을 갖춘 지능형 AI 어시스턴트입니다.

**핵심 행동 원칙:**
- 정확하고 간결하며 맥락에 맞는 답변 제공
- 친근하고 대화적인 톤 유지
- 복잡한 질문은 단계별로 사고
- 웹 검색 결과 사용 시 출처 명시

**자동 웹 검색 및 데이터 수집:**
실시간 웹 정보 접근 가능. 다음 경우 자동으로 검색/수집:
- 최신 뉴스, 이벤트, 최근 동향 관련 질문
- 실시간 정보 필요 (가격, 날씨, 주식 데이터 등)
- 현재 직책/역할에 대한 질문
- 특정 웹사이트의 정보가 필요한 경우
- 최신 정보 검증이 필요한 경우

**웹사이트 직접 방문:**
특정 URL 제공 시 해당 사이트를 직접 방문하여 데이터 수집 가능.

웹 검색 결과나 수집된 데이터를 활용하여 정확하고 최신 정보를 제공하세요.`,

  en: `You are an intelligent AI assistant with web search and data collection capabilities.

**Core Behaviors:**
- Provide accurate, concise, and contextual responses
- Maintain friendly and conversational tone
- Think step-by-step for complex questions
- Cite sources when using web search results

**Auto Web Search & Data Collection:**
Access to real-time web information. Automatically search/collect when:
- Questions about current events, news, or recent developments
- Queries requiring up-to-date information (prices, weather, stock data)
- Questions about people's current roles or positions
- When specific website information is needed
- Verification of facts that may have changed recently

**Direct Website Access:**
Can visit specific URLs to collect data when provided.

Use web search results or collected data to provide accurate and up-to-date answers.`,

  ja: `あなたはウェブ検索とデータ収集機能を備えた知的なAIアシスタントです。

**コア動作原則:**
- 正確で簡潔、文脈に即した回答を提供
- フレンドリーで会話的なトーンを維持
- 複雑な質問は段階的に思考
- ウェブ検索結果使用時は出典を明記

**自動ウェブ検索とデータ収集:**
リアルタイムのウェブ情報にアクセス可能。以下の場合に自動検索/収集:
- 最新ニュース、イベント、最近の動向に関する質問
- リアルタイム情報が必要な場合（価格、天気、株価データなど）
- 人物の現在の役職に関する質問
- 特定のウェブサイトの情報が必要な場合
- 最新情報の検証が必要な場合

**ウェブサイト直接訪問:**
特定のURL提供時、そのサイトを直接訪問してデータ収集可能。

ウェブ検索結果や収集データを活用して正確で最新の情報を提供してください。`,

  zh: `您是一个具有网络搜索和数据收集功能的智能AI助手。

**核心行为准则:**
- 提供准确、简洁、符合上下文的回答
- 保持友好和对话式的语气
- 对复杂问题进行逐步思考
- 使用网络搜索结果时注明来源

**自动网络搜索和数据收集:**
可访问实时网络信息。在以下情况下自动搜索/收集:
- 关于最新新闻、事件或近期发展的问题
- 需要最新信息的查询（价格、天气、股票数据等）
- 关于人物当前职位的问题
- 需要特定网站信息时
- 需要验证可能已更改的事实

**直接访问网站:**
提供特定URL时可直接访问该网站收集数据。

使用网络搜索结果或收集的数据提供准确和最新的答案。`
};

// === 다국어 상태 메시지 ===
const STATUS_MESSAGES = {
  ko: {
    searching: "🔍 웹 검색 중...",
    scraping: "🌐 웹사이트 방문 중...",
    processing: "💭 정보 분석 중...",
  },
  en: {
    searching: "🔍 Searching the web...",
    scraping: "🌐 Visiting website...",
    processing: "💭 Processing information...",
  },
  ja: {
    searching: "🔍 ウェブ検索中...",
    scraping: "🌐 ウェブサイト訪問中...",
    processing: "💭 情報分析中...",
  },
  zh: {
    searching: "🔍 正在搜索网络...",
    scraping: "🌐 正在访问网站...",
    processing: "💭 正在处理信息...",
  }
};

// === 검색 트리거 (다국어) ===
const SEARCH_TRIGGERS = [
  // 영어
  /\b(latest|current|recent|now|today|tonight|yesterday|tomorrow)\b/i,
  /\b(weather|temperature|forecast|price|cost|stock|exchange rate)\b/i,
  /\b(news|breaking|announced|happened)\b/i,
  /\b(who is (the )?(current|now)|is .+ still)\b/i,
  
  // 한국어
  /\b(최신|현재|최근|오늘|어제|내일|지금)\b/i,
  /\b(날씨|기온|예보|가격|시세|주가|환율)\b/i,
  /\b(뉴스|속보|발표|일어났)\b/i,
  /\b(누가|누구|현직|아직)\b/i,
  
  // 일본어
  /\b(最新|現在|最近|今日|昨日|明日|今)\b/i,
  /\b(天気|気温|予報|価格|相場|株価|為替)\b/i,
  /\b(ニュース|速報|発表|起きた)\b/i,
  
  // 중국어
  /\b(最新|当前|最近|今天|昨天|明天|现在)\b/i,
  /\b(天气|气温|预报|价格|行情|股价|汇率)\b/i,
  /\b(新闻|快讯|宣布|发生)\b/i,
];

// URL 패턴 감지
const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;

// === CORS 헤더 ===
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept-Language",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      const res = await env.ASSETS.fetch(request);
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    if (request.method === "POST") {
      switch (url.pathname) {
        case "/api/chat":
          return handleChatRequest(request, env, MODEL_DEFAULT);
        case "/api/v0/gpt-oss-20b":
          return handleChatRequest(request, env, MODEL_GPT20B);
        case "/api/v0/llm3.2-3b":
          return handleChatRequest(request, env, MODEL_LLM3_2_3B);
        default:
          return new Response("Not found", { status: 404, headers: corsHeaders() });
      }
    }

    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>;

// ====================================================
// 언어 감지
// ====================================================
function detectLanguage(text: string): 'ko' | 'en' | 'ja' | 'zh' {
  const koreanChars = (text.match(/[가-힣]/g) || []).length;
  const japaneseChars = (text.match(/[ぁ-んァ-ヶ]/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  
  if (koreanChars > 0) return 'ko';
  if (japaneseChars > 0) return 'ja';
  if (chineseChars > 0) return 'zh';
  return 'en';
}

// ====================================================
// 웹 검색이 필요한지 감지
// ====================================================
function needsWebSearch(userMessage: string): boolean {
  return SEARCH_TRIGGERS.some(pattern => pattern.test(userMessage));
}

// ====================================================
// URL 추출
// ====================================================
function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN);
  return matches ? Array.from(new Set(matches)) : [];
}

// ====================================================
// 구글 검색 (다국어 지원)
// ====================================================
async function performGoogleSearch(query: string, lang: string, env: Env): Promise<string> {
  try {
    if (!env.MYBROWSER) {
      return "Web search unavailable: Browser Rendering not configured";
    }

    const googleDomains = {
      ko: 'google.co.kr',
      en: 'google.com',
      ja: 'google.co.jp',
      zh: 'google.com.hk'
    };
    
    const domain = googleDomains[lang as keyof typeof googleDomains] || 'google.com';
    const searchUrl = `https://www.${domain}/search?q=${encodeURIComponent(query)}&hl=${lang}`;
    
    const browser = await env.MYBROWSER.launch();
    const page = await browser.newPage();
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 10000 });
    
    const results = await page.evaluate(() => {
      const searchResults: Array<{ title: string; snippet: string; link: string }> = [];
      const resultElements = document.querySelectorAll('.g, .tF2Cxc');
      
      for (let i = 0; i < Math.min(3, resultElements.length); i++) {
        const elem = resultElements[i];
        const titleElem = elem.querySelector('h3');
        const snippetElem = elem.querySelector('.VwiC3b, .yXK7lf, .s');
        const linkElem = elem.querySelector('a');
        
        if (titleElem && linkElem) {
          searchResults.push({
            title: titleElem.textContent || '',
            snippet: snippetElem?.textContent || '',
            link: linkElem.href || ''
          });
        }
      }
      
      return searchResults;
    });
    
    await browser.close();
    
    if (results.length === 0) {
      return "No search results found";
    }
    
    const formattedResults = results.map((result, idx) => {
      return `[${idx + 1}] ${result.title}\n${result.snippet}\nSource: ${result.link}`;
    }).join("\n\n");
    
    return `Search Results for "${query}":\n\n${formattedResults}`;
  } catch (error) {
    console.error("Search error:", error);
    return `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// ====================================================
// 특정 웹사이트 방문 및 데이터 수집
// ====================================================
async function scrapeWebsite(url: string, env: Env): Promise<string> {
  try {
    if (!env.MYBROWSER) {
      return "Web scraping unavailable: Browser Rendering not configured";
    }

    const browser = await env.MYBROWSER.launch();
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    
    const pageData = await page.evaluate(() => {
      const title = document.title;
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      
      const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.content',
        '.post-content',
        '.entry-content',
        '#content'
      ];
      
      let mainContent = '';
      for (const selector of contentSelectors) {
        const elem = document.querySelector(selector);
        if (elem) {
          mainContent = elem.textContent || '';
          break;
        }
      }
      
      if (!mainContent) {
        mainContent = document.body.textContent || '';
      }
      
      mainContent = mainContent
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
      
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map(h => h.textContent?.trim())
        .filter(Boolean)
        .slice(0, 10);
      
      return {
        title,
        description: metaDesc,
        headings,
        content: mainContent
      };
    });
    
    await browser.close();
    
    let result = `Website Data from: ${url}\n\n`;
    result += `Title: ${pageData.title}\n\n`;
    
    if (pageData.description) {
      result += `Description: ${pageData.description}\n\n`;
    }
    
    if (pageData.headings.length > 0) {
      result += `Main Headings:\n${pageData.headings.join('\n')}\n\n`;
    }
    
    result += `Content:\n${pageData.content}`;
    
    return result;
  } catch (error) {
    console.error("Scraping error:", error);
    return `Failed to scrape website: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// ====================================================
// Chat Handler (스트리밍 상태 업데이트 포함)
// ====================================================
async function handleChatRequest(
  request: Request,
  env: Env,
  modelId: string,
): Promise<Response> {
  try {
    const { messages = [], stream = false } = (await request.json()) as { 
      messages: ChatMessage[];
      stream?: boolean;
    };
    
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    const detectedLang = lastUserMessage ? detectLanguage(lastUserMessage.content) : 'en';
    
    if (!messages.some(msg => msg.role === "system")) {
      messages.unshift({ 
        role: "system", 
        content: SYSTEM_PROMPTS[detectedLang]
      });
    }

    // 검색/스크래핑이 필요한 경우 스트리밍 응답
    if (lastUserMessage) {
      const userContent = lastUserMessage.content;
      const urls = extractUrls(userContent);
      const needsSearch = needsWebSearch(userContent);
      
      // 검색이나 스크래핑이 필요한 경우
      if (urls.length > 0 || needsSearch) {
        const statusMessages = STATUS_MESSAGES[detectedLang];
        
        // ReadableStream 생성
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        
        // 비동기로 검색/스크래핑 수행
        (async () => {
          try {
            let additionalContext = "";
            
            // URL 스크래핑
            if (urls.length > 0) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ status: statusMessages.scraping })}\n\n`));
              
              for (const url of urls) {
                const scrapedData = await scrapeWebsite(url, env);
                additionalContext += `\n\n${scrapedData}\n`;
              }
            }
            
            // 웹 검색
            if (needsSearch) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ status: statusMessages.searching })}\n\n`));
              
              const searchQuery = userContent.slice(0, 100);
              const searchResults = await performGoogleSearch(searchQuery, detectedLang, env);
              additionalContext += `\n\n${searchResults}\n`;
            }
            
            // 처리 중 메시지
            await writer.write(encoder.encode(`data: ${JSON.stringify({ status: statusMessages.processing })}\n\n`));
            
            // 컨텍스트 추가
            if (additionalContext) {
              messages.push({
                role: "system",
                content: `Additional Information:\n${additionalContext}\n\nUse this information to provide an accurate answer. Always cite your sources.`
              });
            }
            
            // LLM 응답 생성
            let payload: any = {};
            if (modelId.startsWith("@cf/openai/gpt-oss")) {
              const systemPrompt = messages.find(msg => msg.role === "system")?.content || SYSTEM_PROMPTS[detectedLang];
              const userText = messages
                .filter(m => m.role !== "system")
                .map(m => m.content)
                .join("\n");
              payload = {
                instructions: systemPrompt,
                input: userText,
                max_tokens: 2048,
              };
            } else {
              payload = { 
                messages, 
                max_tokens: 2048,
                temperature: 0.7,
                stream: true
              };
            }
            
            const aiResponse = await env.AI.run(modelId, payload, { returnRawResponse: false });
            
            // AI 응답 스트리밍
            if (aiResponse && typeof aiResponse === 'object' && 'response' in aiResponse) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content: aiResponse.response })}\n\n`));
            }
            
            await writer.write(encoder.encode('data: [DONE]\n\n'));
          } catch (error) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
          } finally {
            await writer.close();
          }
        })();
        
        return new Response(readable, {
          headers: {
            ...corsHeaders(),
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
    }

    // 일반 응답 (검색 불필요)
    let payload: any = {};
    if (modelId.startsWith("@cf/openai/gpt-oss")) {
      const systemPrompt = messages.find(msg => msg.role === "system")?.content || SYSTEM_PROMPTS[detectedLang];
      const userText = messages
        .filter(m => m.role !== "system")
        .map(m => m.content)
        .join("\n");
      payload = {
        instructions: systemPrompt,
        input: userText,
        max_tokens: 2048,
      };
    } else {
      payload = { 
        messages, 
        max_tokens: 2048,
        temperature: 0.7
      };
    }

    const aiResponse = await env.AI.run(modelId, payload, { returnRawResponse: true });

    const headers = new Headers(aiResponse.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

    return new Response(aiResponse.body, { status: aiResponse.status, headers });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to process request",
        detail: err instanceof Error ? err.message : JSON.stringify(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  }
                                                              }
