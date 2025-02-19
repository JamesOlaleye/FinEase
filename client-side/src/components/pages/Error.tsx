import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Error({ code, message, goto }: IError) {
  const navigate = useNavigate();

  useEffect(() => {
    if (code === 401) {
      setTimeout(() => {
        navigate('/login');
      }, 1000);
    }
  })


  return (
    <div id="error-screen">
      <h1>Error {code}</h1>
      <p>{message}</p>
      <Link to={goto}>{goto === '/login' ? 'Login' : 'Home'}</Link>
    </div>
  )
}

interface IError {
  code: number;
  message: string;
  goto: string
}