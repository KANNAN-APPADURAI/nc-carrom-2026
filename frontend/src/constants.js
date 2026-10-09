// Group identity lives here: the backend owns the codes and call signs, the
// front end owns how each one looks on the board.
export const GROUP_STYLES = {
  A: { color: '#F6C445', glow: 'rgba(246, 196, 69, 0.35)' },
  B: { color: '#38BDF8', glow: 'rgba(56, 189, 248, 0.35)' },
  C: { color: '#FB7185', glow: 'rgba(251, 113, 133, 0.35)' },
  D: { color: '#34D399', glow: 'rgba(52, 211, 153, 0.35)' },
  E: { color: '#A78BFA', glow: 'rgba(167, 139, 250, 0.35)' },
}

export const groupStyle = (code) => GROUP_STYLES[code] ?? GROUP_STYLES.A

// Best of 3 boards per tie.
export const MAX_BOARDS = 3

// Top two of each group go through to the knockouts.
export const QUALIFY_COUNT = 2

// Only for the "Fill sample teams" button, to try the site out.
export const DEMO_TEAMS = [
  ['Aarav Menon', 'Divya Krishnan'],
  ['Rahul Nair', 'Sneha Pillai'],
  ['Vikram Rao', 'Ananya Iyer'],
  ['Karthik Suresh', 'Meera Joseph'],
  ['Arjun Das', 'Priya Varma'],
  ['Nikhil Shetty', 'Lakshmi Ramesh'],
  ['Sanjay Gupta', 'Riya Thomas'],
  ['Aditya Bose', 'Kavya Reddy'],
  ['Manoj Kumar', 'Pooja Shah'],
  ['Rohan Fernandes', 'Shruti Desai'],
  ['Imran Qureshi', 'Neha Balan'],
  ['Siddharth Jain', 'Tanya Mathew'],
  ['Harish Babu', 'Deepa Anand'],
  ['Yusuf Khan', 'Ishita Roy'],
  ['Gautam Prasad', 'Nandini Rao'],
  ['Varun Chandra', 'Asha Vincent'],
  ['Prakash Mohan', 'Swetha Raj'],
  ['Alok Mishra', 'Rekha Sundar'],
  ['Tarun Bhat', 'Jyothi Nambiar'],
  ['Sameer Ali', 'Bhavana Hegde'],
  ['Naveen Kurup', 'Ritika Sen'],
  ['Mahesh Pandey', 'Leela Narayan'],
  ['Vivek Chopra', 'Aishwarya Dev'],
  ['Suresh Pillai', 'Farah Sheikh'],
  ['Dinesh Kannan', 'Pallavi Ghosh'],
]
