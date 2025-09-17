export const getCurrentYM = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  export const monthLabelPT = (ym: string) =>
    new Date(`${ym}-01T00:00:00`).toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
  