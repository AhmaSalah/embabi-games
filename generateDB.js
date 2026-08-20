const fs = require('fs');

const positions = {
    'GK': [
        ['Alisson Becker', 90], ['Ederson', 89], ['Thibaut Courtois', 90], ['Marc-André ter Stegen', 89], ['Jan Oblak', 88],
        ['Gianluigi Donnarumma', 88], ['Emiliano Martínez', 87], ['Mike Maignan', 87], ['Manuel Neuer', 87], ['Yann Sommer', 85],
        ['Guglielmo Vicario', 84], ['Jordan Pickford', 84], ['David Raya', 84], ['André Onana', 83], ['Alex Meret', 83],
        ['Unai Simón', 84], ['Gregor Kobel', 86], ['Wojciech Szczęsny', 85], ['Kepa Arrizabalaga', 82], ['Aaron Ramsdale', 82],
        ['Nick Pope', 82], ['Lukasz Fabianski', 79], ['Keylor Navas', 83],
        ['Lev Yashin', 94], ['Gianluigi Buffon', 93], ['Iker Casillas', 92], ['Peter Schmeichel', 91],
        ['Essam El-Hadary', 87],
        // Additional 12
        ['David de Gea', 85], ['Hugo Lloris', 84], ['Kasper Schmeichel', 83], ['Stefan Ortega', 81],
        ['Caoimhin Kelleher', 80], ['Bernd Leno', 81], ['Dida', 88], ['Cláudio Taffarel', 87],
        ['Oliver Kahn', 92], ['Edwin van der Sar', 91], ['Petr Čech', 91], ['Julio César', 89]
    ],
    'RB': [
        ['Kyle Walker', 85], ['Trent Alexander-Arnold', 86], ['Reece James', 84], ['Kieran Trippier', 85], ['Achraf Hakimi', 84],
        ['Jeremie Frimpong', 84], ['Dani Carvajal', 85], ['Ben White', 83], ['Diogo Dalot', 83], ['Pedro Porro', 82],
        ['Giovanni Di Lorenzo', 84], ['Denzel Dumfries', 82], ['Nahuel Molina', 82], ['Joao Cancelo', 85], ['Jules Koundé', 85],
        ['Matty Cash', 79], ['Aaron Wan-Bissaka', 80], ['Malo Gusto', 80], ['Takehiro Tomiyasu', 80], ['Jonathan Clauss', 81],
        ['Nordi Mukiele', 79], ['Sergi Roberto', 80], ['Jesus Navas', 80],
        ['Cafu', 93], ['Philipp Lahm', 92], ['Javier Zanetti', 92], ['Carlos Alberto', 91],
        ['Ahmed Fathy', 85],
        // Additional 12
        ['Lilian Thuram', 88], ['Branislav Ivanović', 84], ['Micah Richards', 81], ['Pablo Zabaleta', 83],
        ['Maicon', 89], ['Gary Neville', 87], ['Noussair Mazraoui', 81], ['Sergiño Dest', 78],
        ['Hector Bellerin', 79], ['Tariq Lamptey', 77], ['Seamus Coleman', 79], ['Nathaniel Clyne', 78]
    ],
    'LB': [
        ['Andrew Robertson', 86], ['Theo Hernández', 85], ['Alphonso Davies', 84], ['Ferland Mendy', 83], ['Oleksandr Zinchenko', 83],
        ['Luke Shaw', 82], ['Destiny Udogie', 81], ['Federico Dimarco', 84], ['Alejandro Grimaldo', 84], ['Nuno Mendes', 82],
        ['Ben Chilwell', 80], ['Pervis Estupiñán', 80], ['Marcos Acuña', 82], ['José Gayà', 81], ['Ian Maatsen', 79],
        ['Antonee Robinson', 79], ['Raphaël Guerreiro', 81], ['David Raum', 80], ['Tyrick Mitchell', 78], ['Rico Henry', 78],
        ['Emerson Palmieri', 79], ['Lucas Digne', 79], ['Rayan Aït-Nouri', 79],
        ['Roberto Carlos', 92], ['Paolo Maldini', 94], ['Ashley Cole', 89], ['Marcelo', 88],
        ['Sayed Moawad', 85],
        // Additional 12
        ['Kieran Tierney', 80], ['Jordi Alba', 84], ['Alex Sandro', 81], ['Alex Telles', 80],
        ['Renan Lodi', 79], ['Bixente Lizarazu', 87], ['Denis Irwin', 85], ['Patrice Evra', 88],
        ['Joan Capdevila', 86], ['Fabio Grosso', 84], ['Gael Clichy', 81], ['Leighton Baines', 83]
    ],
    'CB': [
        ['Virgil van Dijk', 90], ['Rúben Dias', 89], ['William Saliba', 87], ['John Stones', 86], ['Antonio Rüdiger', 86],
        ['Marquinhos', 86], ['Ronald Araújo', 85], ['Éder Militão', 85], ['Alessandro Bastoni', 85], ['Kim Min Jae', 84],
        ['Gabriel Magalhães', 84], ['Sven Botman', 83], ['Lisandro Martínez', 83], ['Cristian Romero', 83], ['Dayot Upamecano', 83],
        ['Ibrahima Konaté', 82], ['Manuel Akanji', 82], ['Raphaël Varane', 84], ['Thiago Silva', 83], ['Bremer', 84],
        ['Fikayo Tomori', 83], ['Pau Torres', 82], ['Nathan Aké', 82],
        ['Franco Baresi', 93], ['Franz Beckenbauer', 94], ['Sergio Ramos', 91], ['Fabio Cannavaro', 92],
        ['Wael Gomaa', 86],
        // Additional 12
        ['Alessandro Nesta', 92], ['Carles Puyol', 91], ['John Terry', 90], ['Rio Ferdinand', 90],
        ['Nemanja Vidić', 89], ['Vincent Kompany', 89], ['Jaap Stam', 89], ['Gerard Piqué', 88],
        ['Giorgio Chiellini', 88], ['Pepe', 87], ['Diego Godín', 87], ['Mats Hummels', 87]
    ],
    'CDM': [
        ['Rodri', 90], ['Declan Rice', 87], ['Casemiro', 87], ['Joshua Kimmich', 87], ["N'Golo Kanté", 86],
        ['Sandro Tonali', 85], ['Aurélien Tchouaméni', 85], ['Bruno Guimarães', 85], ['Thomas Partey', 84], ['João Palhinha', 84],
        ['Edson Álvarez', 82], ['Moisés Caicedo', 82], ['Yves Bissouma', 82], ['Douglas Luiz', 83], ['Boubacar Kamara', 81],
        ['Manuel Ugarte', 81], ['Amadou Onana', 80], ['Sofyan Amrabat', 80], ['Pierre-Emile Højbjerg', 80], ['Wataru Endo', 80],
        ['Cheick Doucouré', 79], ['Tyler Adams', 79], ['Kalvin Phillips', 78],
        ['Claude Makélélé', 90], ['Patrick Vieira', 91], ['Roy Keane', 90], ['Gennaro Gattuso', 89],
        ['Hossam Ashour', 85],
        // Additional 12
        ['Sergio Busquets', 88], ['Xabi Alonso', 88], ['Andrea Pirlo', 90], ['Lothar Matthäus', 93],
        ['Frank Rijkaard', 90], ['Michael Essien', 88], ['Esteban Cambiasso', 87], ['Javier Mascherano', 87],
        ['Daniele De Rossi', 86], ['Gilberto Silva', 85], ['Edgar Davids', 86], ['Fernandinho', 86]
    ],
    'CM': [
        ['Kevin De Bruyne', 91], ['Luka Modrić', 88], ['Frenkie de Jong', 87], ['Toni Kroos', 87], ['Nicolò Barella', 86],
        ['Jude Bellingham', 88], ['Federico Valverde', 87], ['Bernardo Silva', 88], ['Martin Ødegaard', 87], ['İlkay Gündoğan', 86],
        ['Pedri', 86], ['Gavi', 84], ['Enzo Fernández', 83], ['Mac Allister', 84], ['Leon Goretzka', 85],
        ['Eduardo Camavinga', 83], ['Mateo Kovačić', 83], ['Christian Eriksen', 82], ['Youri Tielemans', 81], ['Granit Xhaka', 83],
        ['Rodrigo Bentancur', 82], ['John McGinn', 81], ['Conor Gallagher', 80],
        ['Zinedine Zidane', 96], ['Andrés Iniesta', 93], ['Xavi', 93], ['Steven Gerrard', 91],
        ['Mohamed Shawky', 85],
        // Additional 12
        ['Frank Lampard', 90], ['Paul Scholes', 89], ['Cesc Fàbregas', 88], ['Bastian Schweinsteiger', 88],
        ['Clarence Seedorf', 89], ['Ruud Gullit', 93], ['Michael Ballack', 89], ['Deco', 88],
        ['Arturo Vidal', 86], ['Ivan Rakitić', 85], ['Paul Pogba', 86], ['Thiago Alcântara', 85]
    ],
    'CAM': [
        ['Bruno Fernandes', 88], ['Jamal Musiala', 87], ['Florian Wirtz', 86], ['Christopher Nkunku', 85], ['Phil Foden', 86],
        ['James Maddison', 84], ['Mason Mount', 81], ['Dominik Szoboszlai', 83], ['Lucas Paquetá', 82], ['Eberechi Eze', 81],
        ['Piotr Zieliński', 83], ['Lorenzo Pellegrini', 83], ['Julian Brandt', 83], ['Dani Olmo', 83], ['Nabil Fekir', 82],
        ['Brahim Díaz', 81], ['Xavi Simons', 81], ['Morgan Gibbs-White', 79], ['Emile Smith Rowe', 78], ['Andreas Pereira', 78],
        ['Daichi Kamada', 79], ['Hakan Çalhanoğlu', 85], ['Paulo Dybala', 86],
        ['Diego Maradona', 97], ['Ronaldinho', 94], ['Kaká', 92], ['Juan Román Riquelme', 89],
        ['Mohamed Aboutrika', 89],
        // Additional 12
        ['Wesley Sneijder', 89], ['Mesut Özil', 88], ['David Silva', 88], ['Juan Mata', 85],
        ['Rui Costa', 88], ['Zico', 93], ['Michel Platini', 94], ['Michael Laudrup', 90],
        ['Gheorghe Hagi', 89], ['Jay-Jay Okocha', 87], ['Thomas Müller', 87], ['James Rodríguez', 85]
    ],
    'RW': [
        ['Mohamed Salah', 90], ['Bukayo Saka', 87], ['Rodrygo', 86], ['Ousmane Dembélé', 85], ['Riyad Mahrez', 85],
        ['Lionel Messi', 90], ['Leroy Sané', 85], ['Dejan Kulusevski', 82], ['Antony', 80], ['Raphinha', 84],
        ['Moussa Diaby', 83], ['Jarrod Bowen', 82], ['Michael Olise', 81], ['Pedro Neto', 80], ['Serge Gnabry', 83],
        ['Marco Asensio', 82], ['Federico Chiesa', 83], ['Leon Bailey', 80], ['Miguel Almirón', 80], ['Bryan Mbeumo', 79],
        ['Brennan Johnson', 78], ['Christian Pulisic', 80], ['Domenico Berardi', 84],
        ['Garrincha', 94], ['Luis Figo', 91], ['George Best', 93], ['Arjen Robben', 90],
        ['Mohamed Barakat', 86],
        // Additional 12
        ['Angel Di Maria', 86], ['Gareth Bale', 89], ['Jairzinho', 92], ['Joe Cole', 85],
        ['Freddie Ljungberg', 86], ['Pavel Nedvěd', 89], ['Eden Hazard', 89], ['Raheem Sterling', 84],
        ['Hulk', 83], ['Willian', 82], ['Xherdan Shaqiri', 81], ['Adama Traoré', 79]
    ],
    'LW': [
        ['Kylian Mbappé', 91], ['Vinícius Júnior', 89], ['Son Heung-min', 88], ['Rafael Leão', 87], ['Khvicha Kvaratskhelia', 86],
        ['Gabriel Martinelli', 84], ['Jack Grealish', 84], ['Marcus Rashford', 84], ['Luis Díaz', 84], ['Jérémy Doku', 81],
        ['Kaoru Mitoma', 81], ['Anthony Gordon', 80], ['Alejandro Garnacho', 79], ['Mykhailo Mudryk', 78], ['Harvey Barnes', 79],
        ['Raheem Sterling', 82], ['Cody Gakpo', 82], ['Kingsley Coman', 85], ['Karim Adeyemi', 80], ['Neymar Jr', 88],
        ['Ferran Torres', 81], ['Leandro Trossard', 81], ['Galeno', 80],
        ['Thierry Henry', 93], ['Ronaldinho', 94], ['Hristo Stoichkov', 90], ['Ryan Giggs', 89],
        ['Mahmoud El Khatib', 88],
        // Additional 12
        ['Sadio Mané', 87], ['David Ginola', 88], ['Marc Overmars', 87], ['John Barnes', 87],
        ['Harry Kewell', 85], ['Marco Reus', 86], ['Pedro', 84], ['David Villa', 88],
        ['Alexis Sánchez', 85], ['Dimitri Payet', 83], ['Franck Ribéry', 89], ['Robert Pires', 88]
    ],
    'ST': [
        ['Erling Haaland', 91], ['Harry Kane', 90], ['Robert Lewandowski', 90], ['Victor Osimhen', 88], ['Karim Benzema', 89],
        ['Lautaro Martínez', 87], ['Antoine Griezmann', 88], ['Alexander Isak', 83], ['Ollie Watkins', 83], ['Ivan Toney', 82],
        ['Julian Álvarez', 83], ['Darwin Núñez', 82], ['Callum Wilson', 81], ['Gabriel Jesus', 83], ['Rasmus Højlund', 79],
        ['Dusan Vlahovic', 84], ['Romelu Lukaku', 83], ['Ciro Immobile', 84], ['Randal Kolo Muani', 83], ['Marcus Thuram', 81],
        ['Gonçalo Ramos', 80], ['Dominic Solanke', 79], ['Richarlison', 80],
        ['Pelé', 98], ['Ronaldo Nazário', 97], ['Marco van Basten', 93], ['Romário', 92],
        ['Emad Moteab', 86],
        // Additional 12
        ['Wayne Rooney', 90], ['Sergio Agüero', 89], ['Luis Suárez', 90], ['Zlatan Ibrahimović', 90],
        ['Didier Drogba', 89], ['Samuel Eto\'o', 90], ['Alan Shearer', 90], ['Ian Wright', 88],
        ['Fernando Torres', 88], ['Ruud van Nistelrooy', 90], ['Robin van Persie', 89], ['Dennis Bergkamp', 90]
    ],
    'Manager': [
        ['Pep Guardiola', 93], ['Jürgen Klopp', 92], ['Carlo Ancelotti', 91], ['Mikel Arteta', 89], ['Xabi Alonso', 88],
        ['Diego Simeone', 89], ['Antonio Conte', 87], ['Thomas Tuchel', 86], ['Unai Emery', 86], ['Ange Postecoglou', 85],
        ['Roberto De Zerbi', 84], ['Eddie Howe', 83],
        ['Sir Alex Ferguson', 96],
        ['Hassan Shehata', 88],
        // Additional 6
        ['Arsène Wenger', 92], ['Jose Mourinho', 92], ['Zinedine Zidane', 90], ['Massimiliano Allegri', 88],
        ['Mauricio Pochettino', 86], ['Gareth Southgate', 83]
    ]
};

let lines = ['const realPlayersDB = ['];

for (const [pos, players] of Object.entries(positions)) {
    lines.push(`  // ${pos}`);
    for (const player of players) {
        const name = player[0];
        const ovr = player[1];
        lines.push(`  { name: "${name}", position: "${pos}", baseOvr: ${ovr} },`);
    }
}

lines.push('];');

const newArrayStr = lines.join('\n');
const serverJsPath = 'c:/Users/DELL/OneDrive/Desktop/Embabi Games/server.js';
let content = fs.readFileSync(serverJsPath, 'utf-8');

// Replace the array block
content = content.replace(/const realPlayersDB = \[\s*[\s\S]*?\s*\];/, newArrayStr);

fs.writeFileSync(serverJsPath, content, 'utf-8');
