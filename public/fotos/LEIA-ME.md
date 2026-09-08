# Fotos da home pública

A home tem **duas camadas de imagem**, e ela funciona bem só com a primeira:

1. **Ilustrações** (`components/brand/Ilustracoes.tsx`) — cachorro, gato e
   patinhas em SVG, desenhados com os tokens da marca. Estão sempre lá.
2. **Fotos** — os arquivos abaixo. Quando existirem, cobrem as ilustrações.
   Nenhuma linha de código muda: é só soltar o arquivo aqui com o nome exato
   e dar deploy.

| Arquivo | Onde aparece | Proporção | Peso alvo |
|---|---|---|---|
| `hero.jpg` | fundo do topo | 16:9, ≥ 1920px de largura | < 300 KB |
| `pet-1.jpg` … `pet-4.jpg` | mosaico "Os peludos são o ponto" | 1:1 (quadrada), ≥ 800px | < 150 KB cada |
| `tutor.jpg` | card "Para tutores" | 4:3, ≥ 1200px | < 200 KB |
| `petshop.jpg` | card "Para petshops" | 4:3, ≥ 1200px | < 200 KB |
| `faixa.jpg` | faixa antes do formulário | 21:9, ≥ 1920px | < 300 KB |

## Como escolher

1. **Foto real dos petshops parceiros ganha de banco de imagem.** Sem risco de
   licença, e não parece landing genérica. As quatro do mosaico são as mais
   importantes: pet no banho, pet enrolado na toalha, tosa em andamento, pet
   seco e feliz no balcão. Peça autorização do tutor antes de publicar o pet
   dele — é o mesmo cuidado que qualquer petshop já toma pra postar no
   Instagram.
2. Se precisar de banco de imagem, **Unsplash e Pexels** permitem uso
   comercial sem atribuição. **Não** copie foto de site de concorrente
   (inclusive o bichodeluxo.com.br, que serviu de referência de *tom*, não de
   acervo) — a foto é de quem tirou.
3. **O ponto de interesse tem que estar no centro** — todos os blocos usam
   `bg-center` e cortam as bordas em tela estreita.

## Sobre o texto por cima

O contraste é garantido pelo gradiente da marca que fica ATRÁS da foto, não
pela foto. Ainda assim, foto muito clara e de alto contraste no meio atrapalha
a leitura — prefira imagem com uma área calma onde o título fica (à esquerda,
no caso do topo).
