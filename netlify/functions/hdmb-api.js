const GAS_URL = "https://script.google.com/macros/s/AKfycbz73hl3p-vRrwGumzuBOmfryYFtt_QXLzxqDkbtMCQKp1E6ijRDJMF-JIueSKCGMw4C/exec";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: event.body,
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      }
    });

    const text = await res.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: text
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: false,
        message: String(err)
      })
    };
  }
};
