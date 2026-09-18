const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-10 grid md:grid-cols-3 gap-8">

        {/* Logo / About */}
        <div>
          <h2 className="text-2xl font-bold mb-3">MyApp</h2>
          <p className="text-gray-400">
          Fast, reliable and delicious!
          </p>
        </div>

        {/* Links */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Quick Links</h3>
          <ul className="space-y-2 text-gray-400">
            <li className="hover:text-white cursor-pointer">Home</li>
            <li className="hover:text-white cursor-pointer">Login</li>
            <li className="hover:text-white cursor-pointer">Restaurants</li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Contact</h3>
          <p className="text-gray-400">Email: support@myapp.com</p>
          <p className="text-gray-400">Phone: +91 9876543210</p>
        </div>

      </div>

      {/* Bottom */}
      <div className="border-t border-gray-700 text-center py-4 text-gray-400">
        © 2026 MyApp. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;