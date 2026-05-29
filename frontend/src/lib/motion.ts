export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 }
};

export const slideInRight = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0 }
};

export const slideInTop = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0 }
};

export const staggerChildren = {
  show: {
    transition: {
      staggerChildren: 0.05
    }
  }
};
