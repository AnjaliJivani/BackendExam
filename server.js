const express=require("express");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const sqlite3=require("sqlite3").verbose();
require("dotenv").config();
const {authMiddleware,authorizeRole}=require("./middleware/auth")

const app=express();
app.use(express.json());



//database connection
const db=new sqlite3.Database("./database.db",(err)=>{
    if(err){
        console.log(err.message);
    }else{
        console.log("Database Connected Successfully");
    }
})

// database tables creation
db.serialize(()=>{
db.run(`
    CREATE TABLE IF NOT EXISTS roles(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE CHECK(name IN('MANAGER','SUPPORT','USER'))
    
    )
   
    
`),

db.run(`
     CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role_id INTEGER REFERENCES  roles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`)
db.run(`
    CREATE TABLE IF NOT EXISTS  tickets(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     description TEXT NOT NULL,
     status TEXT CHECK(status IN('OPEN','IN_PROGRESS','RESOLVED','CLOSED')) DEFAULT 'OPEN',
     priority   TEXT CHECK(status IN('LOW','MEDIUM','HIGH')) DEFAULT 'MEDIUM',
     created_by INTEGER NOT NULL REFERENCES users(id),
     assigned_to INTEGER NULL REFERENCES users(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    
    )
    `)



db.run(`
    CREATE TABLE IF NOT EXISTS ticket_comments(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
           ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
           user_id INTEGER REFERENCES users(id),
           comment TEXT NOT NULL,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
    )
    
`)


db.run(`
    CREATE TABLE IF NOT EXISTS ticket_status_logs(
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
                 old_status TEXT NOT NULL CHECK(old_status IN('OPEN','IN_PROGRESS','RESOLVED','CLOSED')) ,
                 new_status TEXT NOT NULL CHECK(new_status IN('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
                 changed_by INTEGER REFERENCES users(id),
                 changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 

              
    )
`)})
//login api
app.post("/auth/login",(req,res)=>{
    const {email,password}=req.body;
    db.get("SELECT * FROM users WHERE email=?",[email],
        async(err,user)=>{
            if(err) return res.status(500).json({
                message:err.message
            })
            if(!user) return res.status(400).json({
                message:"user not  found"
            })
            const valid=await bcrypt.compare(password,user.password);
            if(!valid) return res.status(401).json({
                message:"Unauthorized"
            })
            const  token=jwt.sign(
                {id:user.id},
              process.env.JWT_SECRETKEY,
                {expiresIn:"1h"}
       

            )
            res.json({token});
        }
    )
})
//post request user created

app.post("/users",authMiddleware, authorizeRole("MANAGER"),async (req,res)=>{
    const {name,email,newpass,role_id}=req.body;
    if(!name||!email||!newpass||!role_id){
       return res.status(400).json({
        message:"missing fields"
       })
    }
    if(role!="MANAGER"){
        return res.status(403).json({
            message:"Forbidden"
        })
    }
   const password= await bcrypt.hash(newpass,12);
   const created_at = new Date().toISOString();
   

    const sql="INSERT INTO users(name,email,password,role,created_at) VALUES (?,?,?,?,?)"
    db.run(sql,[name, email, password, role_id, created_at],function(err){
        if(err){
           return res.status(400).json({
            message:err.message
           })
        }
        const newId=this.lastID;
       res.status(201).json({
       id:newId,
       name:name,
       email:email,
        role: {
                        id: roleId,
                        name: role // This is the "MANAGER" string from req.body
                    },
       created_at:created_at
    })
    }
   
)

})


    // "id": 0,
    // "name": "string",
    // "email": "user@example.com",
    // "role": {
    //   "id": 0,
    //   "name": "MANAGER"
    // },
    // "created_at": "2026-02-24T07:11:40.166Z"
//get users
app.get("/users",authMiddleware,authorizeRole("MANAGER"),(req,res)=>{
    const user="SELECT users.id as userid,users.name as username,email,roles.id as roleid,roles.name as rolename FROM  users join roles on roles.id=users.role_id"
  db.all(user,[],(err,rows)=>{
    if(err){
        return res.status(401).json({
            message:"Unauthorized"
        })
    }
    const FormattedUsers=rows.map(row=>({
        id:row.id,
        name:row.name,
        email:row.email,
        role:{
            id:row.roleid,
            name:row.rolename
        },
        created_at:row.created_at
    }))
    res.status(200).json({FormattedUsers})
  })
})



//get tickets
app.get("/tickets",authMiddleware,(req,res)=>{
  const ticket=
 "SELECT t.id, t.title, t.description, t.status, t.priority, t.created_at,  u1.id as u1id, u1.name as u1name, u1.email as u1email, u1.role_id as u1role_id, u1.created_at as u1created_at, u2.id as u2id, u2.name as u2name, u2.email as u2email, u2.role_id as u2role_id, u2.created_at as u2created_at FROM tickets t JOIN users u1 ON u1.id = t.created_by  LEFT JOIN users u2 ON u2.id = t.assigned_to "
 db.all(ticket,[],(err,rows)=>{
    if(err){
        return res.status(401).json({
            message:"Unauthorized"
        })
    }
    const FormattedTickets=rows.map(row=>({
        id:row.id,
        title:row.title,
        description:row.description,
        status:row.status,
        priority:row.priority,
        created_by:{
            id:row.u1id,
            name:row.u1name,
            email:row.u1email,
            role:{
                id:row.u1role_id,
                name:"MANAGER"
            },
            created_at:row.u1created_at,
            
        },
        assigned_to:row.u2id ? {
            id:row.u2id,
            name:row.u2name,
            email:row.u2email,
             role:{
                id:row.u2role_id,
                name:"MANAGER"
            },
            created_at:row.u2created_at,

        }:null,
         created_at: row.created_at
    })
)
  res.status(200).json({FormattedTickets})

  })
})
//delete tickets
app.delete("/tickets/:id",authMiddleware,authorizeRole("MANAGER"),(req,res)=>{
    const id=req.params.id;
    const sql="DELETE FROM tickets WHERE ID=?";
    db.get("SELECT COUNT(*) FROM tickets where id =?",[id],(err,row)=>{
            if(err){
                return res.status(500).json({message:err.message})
            }
            if(!row){
                return res.status(404).json({message:"not found"})
            }

            const sql="DELETE FROM tickets WHERE id=?";
            db.run(sql,[id],function(err){
                if(err){
                    return res.status(500).json({message:"server error"})
                }
                return res.status(204).send();
            })
    })
  
 
})
// delete comments
app.delete("/comments/:id",authMiddleware,authorizeRole("MANAGER"),(req,res)=>{
    const id=req.params.id;
    const sql="DELETE FROM ticket_comments WHERE ID=?";
    db.get("SELECT COUNT(*) FROM ticket_comments where id =?",[id],(err,row)=>{
            if(err){
                return res.status(500).json({message:err.message})
            }
            if(!row){
                return res.status(404).json({message:"not found"})
            }

            const sql="DELETE FROM ticket_comments WHERE id=?";
            db.run(sql,[id],function(err){
                if(err){
                    return res.status(500).json({message:"server error"})
                }
                return res.status(204).send();
            })
    })
  

})
//post data into tickets
app.post("/tickets",authMiddleware,authorizeRole("MANAGER","USER"),(req,res)=>{
    const {title,description,priority}=req.body;
    if(!title||!description||!priority){
        return res.status()
    }
})
//basic route
app.get("/",(req,res)=>{
    res.send("api is running");
})




app.listen(3000,()=>{
    console.log("server is running on port 3000");
})