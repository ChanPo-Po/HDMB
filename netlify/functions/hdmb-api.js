const GAS_URL = "https://script.google.com/macros/s/AKfycbz73hl3p-vRrwGumzuBOmfryYFtt_QXLzxqDkbtMCQKp1E6ijRDJMF-JIueSKCGMw4C/exec";
const TIME_ZONE = "Asia/Ho_Chi_Minh";

function digitsOnly(value) {
  return String(value ?? "").replace(/^'/, "").replace(/\D/g, "");
}

function recoverPhone(value) {
  const digits = digitsOnly(value);
  return digits.length === 9 ? `0${digits}` : digits;
}

function recoverDocument(value) {
  const digits = digitsOnly(value);
  // Dữ liệu CCCD cũ thường bị mất đúng 1 số 0 đầu.
  // Không tự pad chuỗi 10 số vì có thể là mã số thuế hợp lệ.
  return digits.length === 11 ? `0${digits}` : digits;
}

function validISODate(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);

  if (
    !Number.isInteger(yy) ||
    !Number.isInteger(mm) ||
    !Number.isInteger(dd) ||
    mm < 1 ||
    mm > 12 ||
    dd < 1 ||
    dd > 31
  ) {
    return "";
  }

  const check = new Date(Date.UTC(yy, mm - 1, dd));

  if (
    check.getUTCFullYear() !== yy ||
    check.getUTCMonth() !== mm - 1 ||
    check.getUTCDate() !== dd
  ) {
    return "";
  }

  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function dateInVietnam(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return validISODate(parts.year, parts.month, parts.day);
}

function normalizeDateISO(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const raw = String(value).trim();

  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (match) {
    return validISODate(match[1], match[2], match[3]);
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}T/.test(raw)) {
    return dateInVietnam(new Date(raw));
  }

  match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[T\s].*)?$/);

  if (match) {
    return validISODate(match[3], match[2], match[1]);
  }

  match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\s].*$/);

  if (match) {
    return validISODate(match[1], match[2], match[3]);
  }

  return dateInVietnam(new Date(raw));
}

function formatDateVN(value) {
  const iso = normalizeDateISO(value);

  if (!iso) {
    return value ? String(value) : "";
  }

  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeInfo(info = {}) {
  const rawSellerPhone = info.sellerPhone ?? "";
  const rawSellerCCCD = info.sellerCCCD ?? "";
  const rawStaffPhone = info.staffPhone ?? "";

  const sellerPhone = recoverPhone(rawSellerPhone);
  const sellerCCCD = recoverDocument(rawSellerCCCD);
  const staffPhone = recoverPhone(rawStaffPhone);

  return {
    ...info,
    date: normalizeDateISO(info.dateISO || info.date),
    dateISO: normalizeDateISO(info.dateISO || info.date),
    dateDisplay: formatDateVN(info.dateISO || info.date),
    sellerIssueDate: normalizeDateISO(
      info.sellerIssueDateISO || info.sellerIssueDate
    ),
    sellerIssueDateISO: normalizeDateISO(
      info.sellerIssueDateISO || info.sellerIssueDate
    ),
    sellerIssueDateDisplay: formatDateVN(
      info.sellerIssueDateISO || info.sellerIssueDate
    ),
    sellerPhone,
    sellerCCCD,
    staffPhone,
    _sellerPhoneNeedsReview:
      Boolean(rawSellerPhone) &&
      (typeof rawSellerPhone === "number" ||
        digitsOnly(rawSellerPhone).length === 9 ||
        !/^0\d{9}$/.test(sellerPhone)),
    _sellerCCCDNeedsReview:
      Boolean(rawSellerCCCD) &&
      (typeof rawSellerCCCD === "number" ||
        digitsOnly(rawSellerCCCD).length === 11 ||
        ![10, 12, 13].includes(sellerCCCD.length)),
    _staffPhoneNeedsReview:
      Boolean(rawStaffPhone) &&
      (typeof rawStaffPhone === "number" ||
        digitsOnly(rawStaffPhone).length === 9 ||
        !/^0\d{9}$/.test(staffPhone))
  };
}

function normalizeResponse(action, payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (action === "searchContracts") {
    const list = Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload)
        ? payload
        : [];

    const normalized = list.map((row) => ({
      ...row,
      date: formatDateVN(row.dateISO || row.date),
      dateISO: normalizeDateISO(row.dateISO || row.date),
      sellerPhone: recoverPhone(row.sellerPhone),
      sellerCCCD: recoverDocument(row.sellerCCCD)
    }));

    if (Array.isArray(payload)) {
      return normalized;
    }

    return {
      ...payload,
      results: normalized
    };
  }

  if (action === "getContract") {
    if (payload.data && payload.data.info) {
      return {
        ...payload,
        data: {
          ...payload.data,
          info: normalizeInfo(payload.data.info)
        }
      };
    }

    if (payload.info) {
      return {
        ...payload,
        info: normalizeInfo(payload.info)
      };
    }
  }

  return payload;
}

function normalizeSaveRequest(request) {
  if (
    request.action !== "saveContract" ||
    !request.data ||
    !request.data.info
  ) {
    return request;
  }

  const info = request.data.info;

  return {
    ...request,
    data: {
      ...request.data,
      info: {
        ...info,
        date: normalizeDateISO(info.date),
        sellerIssueDate: normalizeDateISO(info.sellerIssueDate),
        sellerPhone: digitsOnly(info.sellerPhone),
        sellerCCCD: digitsOnly(info.sellerCCCD),
        staffPhone: digitsOnly(info.staffPhone)
      },
      items: Array.isArray(request.data.items)
        ? request.data.items.map((item) => ({
            ...item,
            imei: String(item.imei ?? "").replace(/^'/, "").trim()
          }))
        : []
    }
  };
}

exports.handler = async function (event) {
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

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: false,
        message: "Chỉ hỗ trợ POST"
      })
    };
  }

  try {
    let requestBody;

    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          ok: false,
          message: "Dữ liệu gửi lên không phải JSON hợp lệ"
        })
      };
    }

    const action = String(requestBody.action || "").trim();
    const normalizedRequest = normalizeSaveRequest(requestBody);

    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(normalizedRequest),
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      }
    });

    const text = await response.text();

    let responseBody = text;

    try {
      responseBody = JSON.stringify(
        normalizeResponse(action, JSON.parse(text))
      );
    } catch (error) {
      // Giữ nguyên nội dung để frontend báo đúng lỗi nếu Apps Script không trả JSON.
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: responseBody
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        ok: false,
        message: error && error.message ? error.message : String(error)
      })
    };
  }
};
