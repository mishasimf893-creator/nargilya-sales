const IIKO_API = "https://api-ru.iiko.services/api/1";
const API_LOGIN = process.env.IIKO_API_KEY || "330f324a4c304236a9165b08ae794f93";

async function getToken() {
  const res = await fetch(IIKO_API + "/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiLogin: API_LOGIN }),
  });
  if (!res.ok) throw new Error("Auth failed: " + res.status);
  const data = await res.json();
  return data.token;
}

async function getOrganizations(token) {
  const res = await fetch(IIKO_API + "/organizations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ returnAdditionalInfo: false }),
  });
  if (!res.ok) throw new Error("Organizations failed: " + res.status);
  const data = await res.json();
  return data.organizations;
}

async function getNomenclature(token, organizationId) {
  const res = await fetch(IIKO_API + "/nomenclature", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ organizationId }),
  });
  if (!res.ok) throw new Error("Nomenclature failed: " + res.status);
  return await res.json();
}

function convertToAppMenu(nomenclature) {
  var groups = nomenclature.groups || [];
  var products = nomenclature.products || [];

  var activeGroups = groups.filter(function(g) {
    return !g.isDeleted && g.isIncludedInMenu;
  });

  var emojiMap = {
    "кальян": "💨", "hookah": "💨",
    "напит": "🥤", "drink": "🥤",
    "бар": "🍸", "bar": "🍸",
    "еда": "🍕", "food": "🍕",
    "кухн": "🍳", "чай": "🍵",
    "коктейл": "🍹", "десерт": "🍰",
    "салат": "🥗", "закуск": "🥟",
    "суп": "🍜", "кофе": "☕",
    "пиво": "🍺", "вино": "🍷",
    "табак": "🔥", "пицц": "🍕",
  };

  function getEmoji(name) {
    var lower = (name || "").toLowerCase();
    var keys = Object.keys(emojiMap);
    for (var i = 0; i < keys.length; i++) {
      if (lower.indexOf(keys[i]) !== -1) return emojiMap[keys[i]];
    }
    return "📦";
  }

  var menu = {};

  for (var gi = 0; gi < activeGroups.length; gi++) {
    var group = activeGroups[gi];
    var groupProducts = products.filter(function(p) {
      return p.parentGroup === group.id && !p.isDeleted && p.isIncludedInMenu && p.type === "Dish";
    });

    if (groupProducts.length === 0) continue;

    var key = group.name
      .toLowerCase()
      .replace(/[^a-z\u0430-\u044f\u04510-9]/gi, "_")
      .replace(/_+/g, "_")
      .substring(0, 20);

    menu[key] = {
      name: group.name,
      emoji: getEmoji(group.name),
      iikoGroupId: group.id,
      items: groupProducts.map(function(p) {
        var price = 0;
        if (p.sizePrices && p.sizePrices[0] && p.sizePrices[0].price) {
          price = p.sizePrices[0].price.currentPrice || 0;
        }
        return {
          id: p.id,
          name: p.name,
          price: price,
          iikoProductId: p.id,
        };
      }),
    };
  }

  return menu;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    var token = await getToken();
    var orgs = await getOrganizations(token);

    if (!orgs || orgs.length === 0) {
      return res.status(404).json({ error: "Организации не найдены" });
    }

    var orgId = orgs[0].id;
    var nomenclature = await getNomenclature(token, orgId);
    var menu = convertToAppMenu(nomenclature);

    return res.status(200).json({
      success: true,
      organizationId: orgId,
      organizationName: orgs[0].name,
      menu: menu,
      rawGroupsCount: (nomenclature.groups || []).length,
      rawProductsCount: (nomenclature.products || []).length,
    });
  } catch (err) {
    console.error("iiko API error:", err);
    return res.status(500).json({
      error: err.message,
      hint: "Проверьте API-ключ и настройки Cloud API в iikoWeb",
    });
  }
};
