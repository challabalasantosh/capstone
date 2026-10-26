const demoUsers = [
  {
    id: "santosh",
    name: "Santosh",
    samplePrompts: [
      "How many orders were placed this month?",
      "Show overdue invoices",
      "What is the total invoice revenue by month?",
      "Which customers have placed the most orders?",
    ],
  },
  {
    id: "santoshi",
    name: "Santoshi",
    samplePrompts: [
      "List active products by category",
      "Show the 10 most expensive products",
      "Which product categories have the most products?",
      "Compare average product prices by category",
    ],
  },
  {
    id: "suresh",
    name: "Suresh",
    samplePrompts: [
      "How many orders were placed this month?",
      "Show overdue invoices",
      "List active products by category",
    ],
  },
  {
    id: "guru",
    name: "Guru",
    samplePrompts: [
      "What is the total invoice revenue by month?",
      "Show the 10 most expensive products",
      "Which customers have placed the most orders?",
    ],
  },
] as const;

export type DemoUser = (typeof demoUsers)[number];

export function findDemoUser(userId: string): DemoUser | undefined {
  return demoUsers.find((user) => user.id === userId);
}
