const jwt=require("jsonwebtoken");
const authMiddleware=(req,res,next)=>{
    try{
        const authHeader=req.headers.authorization;
        if(!authHeader){
            return res.status(400).json({
                message:"Bad Request"
            })
        }
        const token=authHeader.split(" ")[1];
        const decodded=jwt.verify(token,process.env.JWT_SECRETKEY);
        req.user=decodded;
       
        next();
    }catch(err){
        return res.status(400).json({
       message: "Invalid or expired token"
     
    });

    }
}
const authorizeRole=(requiredRole)=>{
    return (req,res,next)=>{
        if(!req.user || req.user.role !== requiredRole){
            return res.status(403).json({
                message:"Forbidden"
            })
        }
        next();
    }
}
module.exports={authMiddleware,authorizeRole};