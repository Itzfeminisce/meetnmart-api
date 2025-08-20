export const messageTemplates = {
    premium: [
      {
        title: "Exclusive alert: A buyer is now active in your market",
        description: "Your premium status puts you ahead. Someone’s browsing where you sell — be ready to connect and close."
      },
      {
        title: "You're in demand!",
        description: "Buyers are checking your market now. Show them why you're a premium seller."
      }
    ],
    verified: [
      {
        title: "A buyer is exploring your verified market",
        description: "Your credibility matters. Engage now while buyers are actively browsing."
      },
      {
        title: "Trust meets opportunity",
        description: "Your verified badge helps you stand out — a buyer is now online in your market."
      }
    ],
    reachable: [
      {
        title: "Heads up! A buyer is nearby",
        description: "Since you’re reachable, now’s the time to respond quickly and stand out."
      },
      {
        title: "Be quick — a buyer is in your market",
        description: "Your availability means you're first in line. Engage now for a chance to sell."
      }
    ],
    default: [
      {
        title: "A buyer just entered your market!",
        description: "Someone is exploring a market you belong to. Stay active to increase your visibility."
      },
      {
        title: "New activity in your market zone",
        description: "A buyer is now browsing listings where you sell. Make your presence felt."
      }
    ]
  };
  

 export  function generateMarketNotification(seller: {
    seller_status: {
      is_premium?: boolean;
      is_verified?: boolean;
      is_reachable?: boolean;
    };
  }) {
    const { is_premium, is_verified, is_reachable } = seller.seller_status;
  
    const categories = [
      is_premium ? "premium" : null,
      is_verified ? "verified" : null,
      is_reachable ? "reachable" : null,
      "default" // fallback always included
    ].filter(Boolean) as (keyof typeof messageTemplates)[];
  
    const allRelevantMessages = categories.flatMap((category) => messageTemplates[category]);
  
    const randomIndex = Math.floor(Math.random() * allRelevantMessages.length);
    return allRelevantMessages[randomIndex];
  }
  